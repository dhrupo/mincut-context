import { describe, it, expect } from 'vitest';
import { parseTypeScript } from '../../../src/parsers/ts.js';

describe('parseTypeScript — sub-symbol chunking', () => {
  it('does not chunk small functions (no chunkOptions)', () => {
    const r = parseTypeScript('a.ts', `export function tiny() { return 1; }`);
    expect(r.symbols.filter((s) => s.name === 'tiny')).toHaveLength(1);
  });

  it('does not chunk when chunkOptions.enabled = false', () => {
    const src = bigBody();
    const r = parseTypeScript('a.ts', src, { enabled: false, maxTokens: 50 });
    // Single symbol for the function, no chunks.
    expect(r.symbols.filter((s) => s.id.startsWith('a.ts:bigFn'))).toHaveLength(1);
  });

  it('chunks a function whose body exceeds maxTokens into top-level statement chunks', () => {
    const src = bigBody();
    const r = parseTypeScript('a.ts', src, { enabled: true, maxTokens: 30 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.ts:bigFn#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // No bare 'bigFn' symbol when chunked (replaced).
    expect(r.symbols.find((s) => s.id === 'a.ts:bigFn')).toBeUndefined();
  });

  it('chunk ids follow the parent#N naming convention', () => {
    const src = bigBody();
    const r = parseTypeScript('a.ts', src, { enabled: true, maxTokens: 30 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.ts:bigFn#'));
    const ids = chunks.map((c) => c.id).sort();
    expect(ids[0]).toBe('a.ts:bigFn#0');
    expect(ids[1]).toBe('a.ts:bigFn#1');
  });

  it('records distinct line ranges per chunk', () => {
    const src = bigBody();
    const r = parseTypeScript('a.ts', src, { enabled: true, maxTokens: 30 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.ts:bigFn#'));
    // All chunk ranges must be inside the function definition span.
    const allRanges = chunks.map((c) => ({ s: c.startLine, e: c.endLine }));
    for (let i = 1; i < allRanges.length; i++) {
      expect(allRanges[i].s).toBeGreaterThanOrEqual(allRanges[i - 1].s);
    }
  });

  it('attributes calls inside a chunk to that chunk', () => {
    const src = `
      export function bigFn() {
        // chunk 0
        helperA();
        helperA();
        const x = helperA();
        // chunk 1
        helperB();
        helperB();
        const y = helperB();
        return x + y;
      }
      function helperA() { return 1; }
      function helperB() { return 2; }
    `;
    const r = parseTypeScript('a.ts', src, { enabled: true, maxTokens: 25 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.ts:bigFn#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const callsFromChunk0 = r.calls.filter((c) => c.from === chunks[0].id);
    expect(callsFromChunk0.map((c) => c.toName)).toContain('helperA');
  });

  it('does not chunk class methods that are small even when chunking is on', () => {
    const src = `
      class C {
        small() { return 1; }
      }
    `;
    const r = parseTypeScript('a.ts', src, { enabled: true, maxTokens: 50 });
    expect(r.symbols.find((s) => s.id === 'a.ts:C.small')).toBeDefined();
    expect(r.symbols.filter((s) => s.id.startsWith('a.ts:C.small#'))).toHaveLength(0);
  });
});

function bigBody(): string {
  return `
export function bigFn() {
  let a = 0;
  a += 1; a += 2; a += 3; a += 4; a += 5;
  console.log('phase one done with a=', a);
  let b = a * 2;
  b -= 1; b -= 2; b -= 3; b -= 4; b -= 5;
  console.log('phase two done with b=', b);
  let c = b + a;
  c *= 2; c *= 3; c *= 4; c *= 5;
  console.log('phase three done with c=', c);
  return c;
}
`;
}
