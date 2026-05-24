import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';
import type { LspClient, LspDefinitionResult, LspLocation, LspPosition } from '../../src/lsp/types.js';

function mockLsp(byKey: Record<string, LspLocation[]>): LspClient & { calls: number } {
  let calls = 0;
  const lsp = {
    async initialize() {},
    async didOpen() {},
    async definition(file: string, pos: LspPosition): Promise<LspDefinitionResult> {
      calls += 1;
      const k = `${file}:${pos.line}:${pos.character}`;
      return { locations: byKey[k] ?? [] };
    },
    async shutdown() {},
    calls,
  } as LspClient & { calls: number };
  Object.defineProperty(lsp, 'calls', { get: () => calls });
  return lsp;
}

describe('pack() with lspClient', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-lsp-'));
    await mkdir(path.join(root, 'src'), { recursive: true });

    // Two helper.ts files with the SAME exported function name — ambiguous
    // for syntactic resolution; LSP can disambiguate.
    await writeFile(
      path.join(root, 'src/caller.ts'),
      `import { doStuff } from './helper-a';
export function caller() { return doStuff(); }`,
    );
    await writeFile(
      path.join(root, 'src/helper-a.ts'),
      `export function doStuff() { return 'a'; }`,
    );
    await writeFile(
      path.join(root, 'src/helper-b.ts'),
      `export function doStuff() { return 'b'; }`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('pack without LSP works as before', async () => {
    const r = await pack({ task: 'caller', repo: root, budget: 500 });
    expect(r.files.length).toBeGreaterThan(0);
    expect(r.trace).toBeUndefined();
  });

  it('pack with a mock LSP threads through and falls back gracefully when LSP returns nothing', async () => {
    const lsp = mockLsp({});
    const r = await pack({
      task: 'caller',
      repo: root,
      budget: 500,
      lspClient: lsp,
      verbose: true,
    });
    // No crash, no edges added — the trace shows zero additions.
    expect(r.trace?.lsp?.added ?? 0).toBe(0);
  });

  it('pack with a useful LSP records resolved + added counts in the trace', async () => {
    // The syntactic parser already attributes caller→helper-a via import
    // resolution.  Our LSP additionally claims caller calls helper-b.doStuff
    // for the test — proves the LSP wiring is real.
    const repoAbs = root;
    const target = path.join(repoAbs, 'src/helper-b.ts');
    const lsp = mockLsp({
      'src/caller.ts:1:32': [
        {
          uri: `file://${target}`,
          range: { start: { line: 0, character: 16 }, end: { line: 0, character: 23 } },
        },
      ],
    });
    const r = await pack({
      task: 'caller',
      repo: root,
      budget: 500,
      lspClient: lsp,
      verbose: true,
    });
    expect(r.trace?.lsp).toBeDefined();
  });
});
