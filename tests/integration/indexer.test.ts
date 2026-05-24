import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { indexRepo } from '../../src/index/builder.js';

describe('indexRepo (TS files only for v1.0)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-test-'));
    await mkdir(path.join(root, 'src/auth'), { recursive: true });
    await mkdir(path.join(root, 'src/ui'), { recursive: true });
    await mkdir(path.join(root, 'node_modules/junk'), { recursive: true });

    await writeFile(
      path.join(root, 'src/auth/login.ts'),
      `
        import { createSession } from './session';
        import { validate } from './validators';
        export function login(user: string, password: string) {
          if (!validate(password)) return null;
          return createSession(user);
        }
      `,
    );
    await writeFile(
      path.join(root, 'src/auth/session.ts'),
      `
        export function createSession(user: string) {
          return { user, token: 'tok' };
        }
        export function destroySession(token: string) {
          return token;
        }
      `,
    );
    await writeFile(
      path.join(root, 'src/auth/validators.ts'),
      `export function validate(pw: string) { return pw.length > 8; }`,
    );
    await writeFile(
      path.join(root, 'src/ui/dashboard.tsx'),
      `
        import { useState } from 'react';
        export function Dashboard() {
          const [n, setN] = useState(0);
          return null;
        }
      `,
    );
    // Should be ignored
    await writeFile(
      path.join(root, 'node_modules/junk/index.ts'),
      `export function shouldNotAppear() {}`,
    );
    // Honor .gitignore
    await writeFile(path.join(root, '.gitignore'), `node_modules/\n*.log\n`);
    await writeFile(path.join(root, 'debug.log'), `log line`);
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('walks the repo and adds one graph node per top-level symbol', () => {
    const { graph } = indexRepo(root);
    const ids = graph.nodes();
    // We should see login, createSession, destroySession, validate, Dashboard
    expect(ids.some((id) => id.endsWith(':login'))).toBe(true);
    expect(ids.some((id) => id.endsWith(':createSession'))).toBe(true);
    expect(ids.some((id) => id.endsWith(':destroySession'))).toBe(true);
    expect(ids.some((id) => id.endsWith(':validate'))).toBe(true);
    expect(ids.some((id) => id.endsWith(':Dashboard'))).toBe(true);
  });

  it('respects .gitignore (skips node_modules and *.log)', () => {
    const { graph } = indexRepo(root);
    expect(graph.nodes().some((id) => id.includes('shouldNotAppear'))).toBe(false);
  });

  it('resolves cross-file call edges via imports', () => {
    const { graph } = indexRepo(root);
    // login() calls createSession() and validate() — both imported.
    const loginId = graph.nodes().find((id) => id.endsWith(':login'))!;
    const targets = graph.outNeighbors(loginId);
    const targetNames = targets.map((t) => t.split(':').slice(1).join(':'));
    expect(targetNames).toContain('createSession');
    expect(targetNames).toContain('validate');
  });

  it('drops unresolvable call targets', () => {
    const { graph } = indexRepo(root);
    // Dashboard calls useState — useState is imported but its definition isn't in
    // the repo, so the call target won't be resolved into a real graph node.
    const dashboardId = graph.nodes().find((id) => id.endsWith(':Dashboard'))!;
    const targets = graph.outNeighbors(dashboardId);
    expect(targets.every((t) => graph.hasNode(t))).toBe(true);
  });

  it('produces stable, deterministic graph across runs', () => {
    const a = indexRepo(root);
    const b = indexRepo(root);
    expect(a.graph.nodes().sort()).toEqual(b.graph.nodes().sort());
    expect(a.graph.size()).toBe(b.graph.size());
  });

  it('reports stats (files scanned, symbols, edges)', () => {
    const { stats } = indexRepo(root);
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.symbols).toBeGreaterThan(0);
    expect(stats.files).toBeLessThan(10); // small fixture, sanity bound
  });

  it('honors include patterns when provided', () => {
    const { graph } = indexRepo(root, { include: ['src/auth/**'] });
    // Should not include Dashboard
    expect(graph.nodes().some((id) => id.includes('Dashboard'))).toBe(false);
    expect(graph.nodes().some((id) => id.includes('login'))).toBe(true);
  });
});
