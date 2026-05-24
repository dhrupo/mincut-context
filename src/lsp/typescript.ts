import { StdioLspClient } from './stdio-client.js';
import type { LspClient } from './types.js';

/**
 * Spawn typescript-language-server for the given repo.
 *
 * Requires the binary to be installed (peerOptional dep — we don't bundle).
 *   npm install -g typescript-language-server
 *   or per-project: npm install --save-dev typescript-language-server
 *
 * If the binary is missing, `initialize()` will throw with a helpful message
 * and the caller should fall back to syntactic resolution.
 */
export function createTypeScriptLsp(opts: { command?: string } = {}): LspClient {
  const command = opts.command ?? 'typescript-language-server';
  return new StdioLspClient(command, ['--stdio']);
}

export function tsLanguageIdFor(file: string): string {
  if (file.endsWith('.tsx')) return 'typescriptreact';
  if (file.endsWith('.jsx')) return 'javascriptreact';
  if (file.endsWith('.ts')) return 'typescript';
  if (file.endsWith('.js')) return 'javascript';
  if (file.endsWith('.mjs') || file.endsWith('.cjs')) return 'javascript';
  return 'plaintext';
}
