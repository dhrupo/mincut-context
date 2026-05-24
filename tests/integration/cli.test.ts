import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BIN = path.resolve(__dirname, '../../dist/adapters/cli/bin.js');

describe('CLI smoke tests (built bin)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-cli-'));
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

  it('prints version', () => {
    const r = spawnSync('node', [BIN, '--version'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('1.0.0');
  });

  it('mcx index reports stats on a real repo', () => {
    const r = spawnSync('node', [BIN, 'index', '--repo', root], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/indexed \d+ files/);
    expect(r.stdout).toMatch(/\d+ symbols/);
  });

  it('mcx pack returns JSON with files and tokens', () => {
    const r = spawnSync(
      'node',
      [BIN, 'pack', 'login', '--repo', root, '--budget', '1000', '--format', 'json'],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.files).toBeInstanceOf(Array);
    expect(parsed.files.length).toBeGreaterThan(0);
    expect(parsed.tokens).toBeLessThanOrEqual(1000);
  });

  it('mcx pack errors on empty task', () => {
    const r = spawnSync('node', [BIN, 'pack', '', '--repo', root], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/task/i);
  });

  it('mcx pack markdown includes the task in the header', () => {
    const r = spawnSync(
      'node',
      [BIN, 'pack', 'login', '--repo', root, '--budget', '500', '--format', 'markdown'],
      { encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^# Context for: login/);
  });
});
