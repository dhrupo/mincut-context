import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';

describe('pack() — end-to-end on a real on-disk repo', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-pack-'));
    await mkdir(path.join(root, 'src/auth'), { recursive: true });
    await mkdir(path.join(root, 'src/ui'), { recursive: true });
    await mkdir(path.join(root, 'src/db'), { recursive: true });

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
        import { findUser } from '../db/users';
        export function createSession(user: string) {
          const u = findUser(user);
          return { user: u, token: 'tok' };
        }
      `,
    );
    await writeFile(
      path.join(root, 'src/auth/validators.ts'),
      `export function validate(pw: string) { return pw.length > 8; }`,
    );
    await writeFile(
      path.join(root, 'src/db/users.ts'),
      `export function findUser(id: string) { return { id }; }`,
    );
    await writeFile(
      path.join(root, 'src/ui/dashboard.tsx'),
      `
        export function Dashboard() { return null; }
        export function Header() { return null; }
      `,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('selects auth files for an auth-related task', async () => {
    const result = await pack({ task: 'fix login validation', repo: root, budget: 2000 });
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('src/auth/login.ts');
    expect(paths.some((p) => p.startsWith('src/auth/'))).toBe(true);
    // No UI in selection for an auth task.
    expect(paths.every((p) => !p.startsWith('src/ui/'))).toBe(true);
  });

  it('respects the token budget', async () => {
    const result = await pack({ task: 'login session', repo: root, budget: 200 });
    expect(result.tokens).toBeLessThanOrEqual(200);
  });

  it('returns a non-empty explanation', async () => {
    const result = await pack({ task: 'login', repo: root, budget: 1000 });
    expect(result.explain).toBeTypeOf('string');
    expect(result.explain.length).toBeGreaterThan(0);
  });

  it('reports graph stats (selected count, cut cost, frontier)', async () => {
    const result = await pack({ task: 'login', repo: root, budget: 1000 });
    expect(result.graph.selected).toBeGreaterThan(0);
    expect(result.graph.cutCost).toBeGreaterThanOrEqual(0);
    expect(result.graph.frontier).toBeGreaterThanOrEqual(0);
  });

  it('emits per-file ranges that lie inside the file', async () => {
    const result = await pack({ task: 'login', repo: root, budget: 1000 });
    for (const f of result.files) {
      expect(f.ranges.length).toBeGreaterThan(0);
      for (const r of f.ranges) {
        expect(r.start).toBeGreaterThan(0);
        expect(r.end).toBeGreaterThanOrEqual(r.start);
      }
    }
  });

  it('falls back gracefully if no symbols match the task', async () => {
    const result = await pack({
      task: 'totallyirrelevantphrase xyzqq',
      repo: root,
      budget: 500,
    });
    // Either zero files or seeded by best-effort partial match — either way, no crash.
    expect(result.files).toBeInstanceOf(Array);
    expect(result.tokens).toBeGreaterThanOrEqual(0);
  });

  it('prunes low-scored seeds when their cumulative tokens exceed the budget', async () => {
    // Tiny budget — many seeds will match "session login" but they can't all fit.
    const result = await pack({
      task: 'login session validate user create',
      repo: root,
      budget: 200,
      seeds: 12,
    });
    // Must not throw, must respect the budget, must return something.
    expect(result.tokens).toBeLessThanOrEqual(200);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('respects include patterns', async () => {
    const result = await pack({
      task: 'login',
      repo: root,
      budget: 1000,
      include: ['src/auth/**'],
    });
    expect(result.files.every((f) => f.path.startsWith('src/auth/'))).toBe(true);
  });
});
