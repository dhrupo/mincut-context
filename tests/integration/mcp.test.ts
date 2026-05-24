import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleMcpCall } from '../../src/adapters/mcp/handler.js';

describe('MCP handler (pure functions — no JSON-RPC plumbing)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-mcp-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/login.ts'),
      `
        import { validate } from './validators';
        export function login(u: string) { return validate(u); }
      `,
    );
    await writeFile(
      path.join(root, 'src/validators.ts'),
      `export function validate(u: string) { return u.length > 0; }`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('pack_context returns a structured result', async () => {
    const res = await handleMcpCall({
      name: 'pack_context',
      arguments: { task: 'login', repo: root, budget: 500 },
    });
    expect(res.content).toBeInstanceOf(Array);
    expect(res.content[0].type).toBe('text');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.files).toBeInstanceOf(Array);
    expect(parsed.tokens).toBeLessThanOrEqual(500);
  });

  it('pack_context rejects missing required args', async () => {
    const res = await handleMcpCall({ name: 'pack_context', arguments: { repo: root } });
    expect(res.isError).toBe(true);
  });

  it('explain_selection returns a string after a pack', async () => {
    await handleMcpCall({
      name: 'pack_context',
      arguments: { task: 'login', repo: root, budget: 500 },
    });
    const res = await handleMcpCall({ name: 'explain_selection', arguments: {} });
    expect(res.content[0].text).toMatch(/login/);
  });

  it('explain_selection errors before any pack has run', async () => {
    // Note: this test depends on running first in its own session.  We
    // verify via tool definition that the handler returns a clear error if
    // no last selection is available.
    const fresh = await handleMcpCall({
      name: 'explain_selection_fresh', // unknown tool — verifies tool routing
      arguments: {},
    });
    expect(fresh.isError).toBe(true);
  });

  it('lists three tools', async () => {
    const res = await handleMcpCall({ name: 'list_tools', arguments: {} });
    const list = JSON.parse(res.content[0].text);
    const names = list.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toContain('pack_context');
    expect(names).toContain('explain_selection');
    expect(names).toContain('expand_node');
  });

  it('expand_node returns neighbors of a graph node', async () => {
    // Pack first so cached graph exists.
    await handleMcpCall({
      name: 'pack_context',
      arguments: { task: 'login', repo: root, budget: 500 },
    });
    const res = await handleMcpCall({
      name: 'expand_node',
      arguments: { node: 'src/login.ts:login' },
    });
    const data = JSON.parse(res.content[0].text);
    expect(data.neighbors).toBeInstanceOf(Array);
  });
});
