import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleMcpCall } from '../../src/adapters/mcp/handler.js';

describe('MCP graph-navigation tools', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-mcp-nav-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/login.ts'),
      `import { createSession } from './session';
       import { validate } from './validators';
       export function login(u: string) {
         validate(u);
         return createSession(u);
       }`,
    );
    await writeFile(
      path.join(root, 'src/session.ts'),
      `import { validate } from './validators';
       export function createSession(u: string) {
         validate(u);
         return u;
       }`,
    );
    await writeFile(
      path.join(root, 'src/validators.ts'),
      `export function validate(u: string) { return u.length > 0; }`,
    );

    // Seed the session.
    await handleMcpCall({
      name: 'pack_context',
      arguments: { task: 'login', repo: root, budget: 1000 },
    });
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('list_tools includes the new navigation tools', async () => {
    const res = await handleMcpCall({ name: 'list_tools', arguments: {} });
    const list = JSON.parse(res.content[0].text);
    const names = list.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('find_callers');
    expect(names).toContain('find_callees');
    expect(names).toContain('search_symbols');
  });

  it('find_callees returns symbols called by the given node', async () => {
    const res = await handleMcpCall({
      name: 'find_callees',
      arguments: { node: 'src/login.ts:login' },
    });
    const data = JSON.parse(res.content[0].text);
    const callees = data.callees.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('src/session.ts:createSession');
    expect(callees).toContain('src/validators.ts:validate');
  });

  it('find_callers returns symbols that call the given node', async () => {
    const res = await handleMcpCall({
      name: 'find_callers',
      arguments: { node: 'src/validators.ts:validate' },
    });
    const data = JSON.parse(res.content[0].text);
    const callers = data.callers.map((c: { caller: string }) => c.caller);
    expect(callers).toContain('src/login.ts:login');
    expect(callers).toContain('src/session.ts:createSession');
  });

  it('search_symbols finds symbols by name', async () => {
    const res = await handleMcpCall({
      name: 'search_symbols',
      arguments: { query: 'session' },
    });
    const data = JSON.parse(res.content[0].text);
    expect(data.hits.length).toBeGreaterThan(0);
    expect(data.hits[0].id).toBe('src/session.ts:createSession');
  });

  it('search_symbols ranks exact-name matches highest', async () => {
    const res = await handleMcpCall({
      name: 'search_symbols',
      arguments: { query: 'validate' },
    });
    const data = JSON.parse(res.content[0].text);
    expect(data.hits[0].id).toBe('src/validators.ts:validate');
  });

  it('find_callers / find_callees error before any pack_context call', async () => {
    // Use a fresh session by importing _resetSession.
    const { _resetSession } = await import('../../src/adapters/mcp/handler.js');
    _resetSession();
    const r1 = await handleMcpCall({ name: 'find_callers', arguments: { node: 'x' } });
    expect(r1.isError).toBe(true);
    const r2 = await handleMcpCall({ name: 'find_callees', arguments: { node: 'x' } });
    expect(r2.isError).toBe(true);
    const r3 = await handleMcpCall({ name: 'search_symbols', arguments: { query: 'x' } });
    expect(r3.isError).toBe(true);
  });
});
