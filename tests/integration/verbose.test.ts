import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';

describe('pack() with verbose=true', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-verbose-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/login.ts'),
      `import { validate } from './validators';
       export function login(u: string) { return validate(u); }`,
    );
    await writeFile(
      path.join(root, 'src/validators.ts'),
      `export function validate(u: string) { return u.length > 0; }`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('returns trace only when verbose=true', async () => {
    const off = await pack({ task: 'login', repo: root, budget: 500 });
    expect(off.trace).toBeUndefined();
    const on = await pack({ task: 'login', repo: root, budget: 500, verbose: true });
    expect(on.trace).toBeDefined();
  });

  it('trace contains seeds, ranks, selection order, and timings', async () => {
    const r = await pack({ task: 'login', repo: root, budget: 500, verbose: true });
    expect(r.trace!.seeds.length).toBeGreaterThan(0);
    expect(r.trace!.topRanked.length).toBeGreaterThan(0);
    expect(r.trace!.selectionOrder.length).toBe(r.graph.selected);
    expect(r.trace!.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(r.trace!.timings.indexMs).toBeGreaterThanOrEqual(0);
  });

  it('trace timings monotonic and sum to <= totalMs (slack for clock jitter)', async () => {
    const r = await pack({ task: 'login', repo: root, budget: 500, verbose: true });
    const t = r.trace!.timings;
    const sum = t.indexMs + t.rankMs + t.selectMs;
    // totalMs is wall-clock; sum is each phase. sum should not exceed total + small slack.
    expect(sum).toBeLessThanOrEqual(t.totalMs + 10);
  });

  it('selection order entries match selected count', async () => {
    const r = await pack({ task: 'login', repo: root, budget: 1000, verbose: true });
    expect(r.trace!.selectionOrder.length).toBe(r.graph.selected);
  });
});
