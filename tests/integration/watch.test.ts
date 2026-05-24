import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startWatch } from '../../src/adapters/cli/watch.js';
import type { PackResult } from '../../src/select/pack.js';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('startWatch', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-watch-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/login.ts'),
      `export function login(u: string) { return u; }`,
    );
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('fires an initial pack and an additional one on file change', async () => {
    const results: Array<{ reason: string; tokens: number }> = [];
    const handle = startWatch(
      { task: 'login', repo: root, budget: 500, debounceMs: 50, usePolling: true },
      (r: PackResult, reason) => results.push({ reason, tokens: r.tokens }),
    );

    // Wait for initial pack + chokidar to finish its `ready` scan.
    await delay(500);
    expect(results.some((r) => r.reason === 'initial')).toBe(true);

    // Touch the file with a future mtime so the change is detected even on
    // filesystems with coarse mtime granularity.
    const file = path.join(root, 'src/login.ts');
    await writeFile(file, `export function login(u: string) { return u + "!"; }`);
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);

    await delay(800);
    expect(results.some((r) => r.reason === 'change')).toBe(true);

    await handle.stop();
  });

  it('stop() halts further events', async () => {
    let count = 0;
    const handle = startWatch(
      { task: 'login', repo: root, budget: 500, debounceMs: 50, usePolling: true },
      () => {
        count += 1;
      },
    );

    await delay(300);
    const initial = count;
    await handle.stop();

    // Modify after stop — should not fire.
    await writeFile(path.join(root, 'src/login.ts'), `export function login() {}`);
    await delay(400);
    expect(count).toBe(initial);
  });

  it('debounces rapid sequential edits into a single re-pack', async () => {
    const results: Array<{ reason: string }> = [];
    const handle = startWatch(
      { task: 'login', repo: root, budget: 500, debounceMs: 200, usePolling: true },
      (_r, reason) => results.push({ reason }),
    );

    await delay(300); // initial settled
    const baseline = results.length;
    const file = path.join(root, 'src/login.ts');
    for (let i = 0; i < 5; i++) {
      await writeFile(file, `export function login() { return ${i}; }`);
      await delay(50);
    }
    await delay(500);
    const changes = results.length - baseline;
    // 5 edits within debounce window should collapse to 1–2 packs.
    expect(changes).toBeLessThanOrEqual(2);

    await handle.stop();
  });
});
