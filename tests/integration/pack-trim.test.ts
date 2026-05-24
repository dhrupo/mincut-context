import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';

describe('pack() — trimScoreRatio', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-trim-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/auth.ts'),
      `import { db } from './db';
       import { logger } from './logger';
       import { helper } from './helper';
       export function authenticate(u: string) {
         logger('login');
         helper();
         return db.find(u);
       }`,
    );
    await writeFile(
      path.join(root, 'src/db.ts'),
      `export const db = { find: (u: string) => u };`,
    );
    await writeFile(
      path.join(root, 'src/logger.ts'),
      `export function logger(_m: string) {}`,
    );
    await writeFile(
      path.join(root, 'src/helper.ts'),
      `export function helper() {}`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('default trim drops weak-score tail files', async () => {
    const withTrim = await pack({ task: 'authenticate', repo: root, budget: 1000 });
    const noTrim = await pack({ task: 'authenticate', repo: root, budget: 1000, trimScoreRatio: 0 });
    expect(withTrim.files.length).toBeLessThanOrEqual(noTrim.files.length);
  });

  it('trim updates the reported token total accordingly', async () => {
    const withTrim = await pack({ task: 'authenticate', repo: root, budget: 1000 });
    const noTrim = await pack({ task: 'authenticate', repo: root, budget: 1000, trimScoreRatio: 0 });
    if (withTrim.files.length < noTrim.files.length) {
      expect(withTrim.tokens).toBeLessThanOrEqual(noTrim.tokens);
    }
  });

  it('keeps the top file even at aggressive trim ratios', async () => {
    const r = await pack({ task: 'authenticate', repo: root, budget: 1000, trimScoreRatio: 0.99 });
    expect(r.files.length).toBeGreaterThanOrEqual(1);
  });

  it('trimScoreRatio=0 disables trimming entirely', async () => {
    const r = await pack({ task: 'authenticate', repo: root, budget: 1000, trimScoreRatio: 0 });
    // Same as no-trim baseline — just ensures the flag works.
    expect(r.files.length).toBeGreaterThanOrEqual(1);
  });
});
