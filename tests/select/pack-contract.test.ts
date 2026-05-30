import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack } from '../../src/select/pack.js';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mcx-pack-contract-'));
  writeFileSync(join(dir, 'validate.ts'),
    'export function validateLogin(u: string, p: string): boolean {\n  return u.length > 0 && p.length > 0;\n}\n');
  writeFileSync(join(dir, 'login.ts'),
    "import { validateLogin } from './validate.js';\nexport function login(u: string, p: string) {\n  if (!validateLogin(u, p)) throw new Error('bad');\n  return true;\n}\n");
  return dir;
}

describe('pack({ contract: true })', () => {
  it('omits contract by default', async () => {
    const r = await pack({ task: 'login validation', repo: fixture(), budget: 60 });
    expect(r.contract).toBeUndefined();
  });

  it('returns a contract whose tokens equal the sum of its stub tokens', async () => {
    const repo = fixture();
    const r = await pack({ task: 'login validation', repo, budget: 60, contract: true });
    expect(r.contract).toBeDefined();
    expect(typeof r.contract!.tokens).toBe('number');
    expect(r.contract!.tokens).toBe(
      r.contract!.stubs.reduce((n, s) => n + s.tokens, 0),
    );
  });

  it('passes ContractOptions through to buildContract (maxTokens cap)', async () => {
    const r = await pack({ task: 'login validation', repo: fixture(), budget: 60, contract: { maxTokens: 1 } });
    expect(r.contract).toBeDefined();
    expect(r.contract!.tokens).toBeLessThanOrEqual(1);
    expect(r.contract!.tokens).toBe(r.contract!.stubs.reduce((n, s) => n + s.tokens, 0));
  });
});
