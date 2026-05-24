import { spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { LspClient, LspDefinitionResult, LspLocation, LspPosition } from './types.js';

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface RpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Bare-metal JSON-RPC client speaking the LSP wire protocol (Content-Length
 * framed messages) over stdio.  Spawns the language-server binary, sends
 * initialize, and exposes definition() for our resolver.
 *
 * Designed to be small, dep-free, and fully decoupled from any specific
 * language server.  The TypeScript adapter just wires the right command +
 * languageId on top of this.
 */
export class StdioLspClient implements LspClient {
  private child: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private openFiles = new Set<string>();
  private rootPath = '';

  constructor(private readonly command: string, private readonly args: string[]) {}

  async initialize(rootPath: string): Promise<void> {
    this.rootPath = rootPath;
    try {
      this.child = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      throw new Error(`lsp: could not spawn '${this.command}' (${(e as Error).message})`);
    }
    if (!this.child.stdout || !this.child.stdin) throw new Error('lsp: no stdio on spawned process');

    let spawnFailed: Error | null = null;
    let spawnReady = false;
    this.child.on('error', (err) => {
      spawnFailed = err;
      this.flushPendingAsErrors(`lsp spawn error: ${err.message}`);
    });
    this.child.on('spawn', () => {
      spawnReady = true;
    });

    this.child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.child.on('exit', () => this.flushPendingAsErrors('lsp server exited'));
    this.child.stderr?.on('data', () => {
      /* swallow — many LSPs are chatty on stderr */
    });

    // Wait up to ~250ms for either 'spawn' or 'error' to settle.  If neither
    // fires we treat it as a startup failure rather than send to a possibly-
    // doomed stdin.
    const deadline = Date.now() + 250;
    while (!spawnReady && !spawnFailed && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    if (spawnFailed || !spawnReady) {
      throw new Error(`lsp: could not start '${this.command}' — install it or omit --lsp`);
    }

    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(rootPath).toString(),
      capabilities: { textDocument: { definition: { dynamicRegistration: false } } },
    });
    this.notify('initialized', {});
  }

  async didOpen(file: string, source: string, languageId: string): Promise<void> {
    if (this.openFiles.has(file)) return;
    this.openFiles.add(file);
    const uri = pathToFileURL(path.resolve(this.rootPath, file)).toString();
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: source },
    });
  }

  async definition(file: string, position: LspPosition): Promise<LspDefinitionResult> {
    const uri = pathToFileURL(path.resolve(this.rootPath, file)).toString();
    const result = (await this.request('textDocument/definition', {
      textDocument: { uri },
      position,
    })) as LspLocation | LspLocation[] | null;
    if (!result) return { locations: [] };
    return { locations: Array.isArray(result) ? result : [result] };
  }

  async shutdown(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    // If stdin is gone, the server is dead — skip the polite handshake.
    if (child.stdin && !child.stdin.destroyed && !child.stdin.writableEnded) {
      try {
        await Promise.race([
          this.request('shutdown', null),
          new Promise<void>((r) => setTimeout(r, 500)),
        ]);
        this.notify('exit', null);
      } catch {
        // ignore
      }
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const req: RpcRequest = { jsonrpc: '2.0', id, method, params };
    this.send(req);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`lsp: timeout on ${method}`));
        }
      }, 10000);
    });
  }

  private notify(method: string, params: unknown): void {
    const n: RpcNotification = { jsonrpc: '2.0', method, params };
    this.send(n);
  }

  private send(message: unknown): void {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed || stdin.writableEnded) return;
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    try {
      stdin.write(header + body);
    } catch {
      /* writes to a dead LSP — ignored */
    }
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
      const m = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!m) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const len = Number(m[1]);
      const total = headerEnd + 4 + len;
      if (this.buffer.length < total) return;
      const body = this.buffer.slice(headerEnd + 4, total).toString('utf8');
      this.buffer = this.buffer.slice(total);
      try {
        const msg = JSON.parse(body) as RpcResponse;
        if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
          const cb = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      } catch {
        // ignore non-JSON server output
      }
    }
  }

  private flushPendingAsErrors(reason: string): void {
    for (const [, cb] of this.pending) cb.reject(new Error(reason));
    this.pending.clear();
  }
}
