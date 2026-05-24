import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';

/**
 * Realistic-shape repo: two cohesive modules (auth, billing) with one weak
 * bridge between them.  The boost should keep an auth-task selection inside
 * the auth community at the budget boundary.
 */
describe('pack() — community boost end-to-end', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-comm-'));
    await mkdir(path.join(root, 'auth'), { recursive: true });
    await mkdir(path.join(root, 'billing'), { recursive: true });
    await mkdir(path.join(root, 'shared'), { recursive: true });

    // Tight auth cluster.
    await writeFile(
      path.join(root, 'auth/login.ts'),
      `import { createSession } from './session';
       import { validateCreds } from './validators';
       export function login(u: string) { validateCreds(u); return createSession(u); }`,
    );
    await writeFile(
      path.join(root, 'auth/session.ts'),
      `import { validateCreds } from './validators';
       export function createSession(u: string) { validateCreds(u); return u; }`,
    );
    await writeFile(
      path.join(root, 'auth/validators.ts'),
      `export function validateCreds(u: string) { return u.length > 0; }`,
    );

    // Tight billing cluster (no shared tokens with auth task).
    await writeFile(
      path.join(root, 'billing/invoice.ts'),
      `import { computeTax } from './tax';
       export function makeInvoice(x: number) { return computeTax(x); }`,
    );
    await writeFile(
      path.join(root, 'billing/tax.ts'),
      `export function computeTax(x: number) { return x * 0.2; }`,
    );

    // Weak bridge: shared/logger called by both, so the graph isn't disjoint.
    await writeFile(
      path.join(root, 'shared/logger.ts'),
      `export function log(_m: string) { /* noop */ }`,
    );
    // Add a single weak edge from auth → logger and billing → logger.
    await writeFile(
      path.join(root, 'auth/login.ts'),
      `import { createSession } from './session';
       import { validateCreds } from './validators';
       import { log } from '../shared/logger';
       export function login(u: string) { log('login'); validateCreds(u); return createSession(u); }`,
    );
    await writeFile(
      path.join(root, 'billing/invoice.ts'),
      `import { computeTax } from './tax';
       import { log } from '../shared/logger';
       export function makeInvoice(x: number) { log('invoice'); return computeTax(x); }`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('ranks the auth cluster above the billing cluster when boost is on', async () => {
    const result = await pack({
      task: 'login validation',
      repo: root,
      budget: 1000,
      communityBoost: 1.5,
    });
    // The auth-community files (where the seed lives) should outrank billing.
    const ranked = result.files
      .filter((f) => f.path.startsWith('auth/') || f.path.startsWith('billing/'))
      .map((f) => f.path);
    const firstAuthIdx = ranked.findIndex((p) => p.startsWith('auth/'));
    const firstBillingIdx = ranked.findIndex((p) => p.startsWith('billing/'));
    expect(firstAuthIdx).toBeGreaterThanOrEqual(0);
    if (firstBillingIdx >= 0) {
      // If billing made it in at all, auth must come strictly before.
      expect(firstAuthIdx).toBeLessThan(firstBillingIdx);
    }
  });

  it('reports community labels per file', async () => {
    const result = await pack({
      task: 'login',
      repo: root,
      budget: 1000,
      communityBoost: 0.5,
    });
    expect(result.files.some((f) => Array.isArray(f.communities) && f.communities.length > 0)).toBe(true);
  });

  it('communityBoost=0 disables community detection entirely', async () => {
    const result = await pack({
      task: 'login',
      repo: root,
      budget: 1000,
      communityBoost: 0,
    });
    // With boost disabled, no community labels should be emitted.
    expect(result.files.every((f) => f.communities === undefined)).toBe(true);
  });

  it('explain output mentions the touched community labels', async () => {
    const result = await pack({
      task: 'login',
      repo: root,
      budget: 1000,
      communityBoost: 0.5,
    });
    expect(result.explain).toMatch(/touched \d+ communit/);
  });
});
