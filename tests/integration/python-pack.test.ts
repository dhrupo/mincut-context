import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';
import { indexRepo } from '../../src/index/builder.js';

describe('pack() — Python repo end-to-end', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-py-'));
    await mkdir(path.join(root, 'auth'), { recursive: true });
    await mkdir(path.join(root, 'ui'), { recursive: true });

    await writeFile(
      path.join(root, 'auth/__init__.py'),
      ``,
    );
    await writeFile(
      path.join(root, 'auth/login.py'),
      `from .session import create_session
from .validators import validate

def login(user, password):
    if not validate(password):
        return None
    return create_session(user)
`,
    );
    await writeFile(
      path.join(root, 'auth/session.py'),
      `def create_session(user):
    return {"user": user, "token": "tok"}
`,
    );
    await writeFile(
      path.join(root, 'auth/validators.py'),
      `def validate(pw):
    return len(pw) > 8
`,
    );
    await writeFile(
      path.join(root, 'ui/__init__.py'),
      ``,
    );
    await writeFile(
      path.join(root, 'ui/dashboard.py'),
      `def render_dashboard():
    return "dashboard"

def render_header():
    return "header"
`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('indexes Python files alongside any others', () => {
    const { graph, stats } = indexRepo(root);
    expect(stats.files).toBeGreaterThan(0);
    expect(graph.nodes().some((id) => id.endsWith(':login'))).toBe(true);
    expect(graph.nodes().some((id) => id.endsWith(':create_session'))).toBe(true);
  });

  it('resolves Python relative imports (from .session import …)', () => {
    const { graph } = indexRepo(root);
    const loginId = graph.nodes().find((id) => id.endsWith(':login'))!;
    const outNames = graph.outNeighbors(loginId).map((id) => id.split(':').slice(1).join(':'));
    expect(outNames).toContain('create_session');
    expect(outNames).toContain('validate');
  });

  it('packs the auth cluster for an auth-shaped task in Python', async () => {
    const result = await pack({ task: 'login validation', repo: root, budget: 1000 });
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('auth/'))).toBe(true);
    // UI files must not appear for an auth task — same cohesion as TS.
    expect(paths.every((p) => !p.startsWith('ui/'))).toBe(true);
  });

  it('handles a mixed Python + TS repo', async () => {
    await writeFile(
      path.join(root, 'auth/login.ts'),
      `export function tsLogin(u: string) { return u; }`,
    );
    const { graph } = indexRepo(root);
    expect(graph.nodes().some((id) => id === 'auth/login.ts:tsLogin')).toBe(true);
    expect(graph.nodes().some((id) => id === 'auth/login.py:login')).toBe(true);
  });
});
