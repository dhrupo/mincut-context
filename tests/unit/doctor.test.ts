import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runDoctor, renderDoctor } from '../../src/adapters/cli/doctor.js';

describe('runDoctor', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-doctor-'));
    await mkdir(path.join(root, '.git'), { recursive: true });
    await writeFile(path.join(root, '.gitignore'), 'node_modules/');
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('returns a structured report with multiple checks', () => {
    const r = runDoctor(root);
    expect(r.checks.length).toBeGreaterThan(3);
    for (const c of r.checks) {
      expect(['ok', 'warn', 'fail']).toContain(c.status);
      expect(c.name).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });

  it('passes the node-version check on the current runner', () => {
    const r = runDoctor(root);
    const node = r.checks.find((c) => c.name === 'node version');
    expect(node?.status).toBe('ok');
  });

  it('passes tree-sitter native + grammar checks', () => {
    const r = runDoctor(root);
    expect(r.checks.find((c) => c.name === 'tree-sitter native')?.status).toBe('ok');
    expect(r.checks.find((c) => c.name === 'language grammars')?.status).toBe('ok');
  });

  it('reports the repo path with .git indicator', () => {
    const r = runDoctor(root);
    const repoCheck = r.checks.find((c) => c.name === 'repo path');
    expect(repoCheck?.status).toBe('ok');
    expect(repoCheck?.detail).toContain('.git');
  });

  it('flags a missing repo path as fail', () => {
    const r = runDoctor('/path/does/not/exist/at/all');
    const repoCheck = r.checks.find((c) => c.name === 'repo path');
    expect(repoCheck?.status).toBe('fail');
    expect(r.ok).toBe(false);
  });

  it('renderDoctor produces a readable plain-text summary', () => {
    const r = runDoctor(root);
    const out = renderDoctor(r, false);
    expect(out).toContain('environment check');
    expect(out).toContain('node version');
    expect(out).toContain('parse cache');
  });
});
