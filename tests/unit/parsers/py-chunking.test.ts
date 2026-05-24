import { describe, it, expect } from 'vitest';
import { parsePython } from '../../../src/parsers/py.js';

describe('parsePython — sub-symbol chunking', () => {
  it('does not chunk when chunkOptions are omitted', () => {
    const r = parsePython('a.py', bigBody());
    expect(r.symbols.filter((s) => s.id.startsWith('a.py:big_fn'))).toHaveLength(1);
  });

  it('does not chunk when chunkOptions.enabled = false', () => {
    const r = parsePython('a.py', bigBody(), { enabled: false, maxTokens: 30 });
    expect(r.symbols.filter((s) => s.id.startsWith('a.py:big_fn'))).toHaveLength(1);
  });

  it('chunks a Python function whose body exceeds maxTokens', () => {
    const r = parsePython('a.py', bigBody(), { enabled: true, maxTokens: 30 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.py:big_fn#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(r.symbols.find((s) => s.id === 'a.py:big_fn')).toBeUndefined();
  });

  it('chunk ids follow parent#N convention', () => {
    const r = parsePython('a.py', bigBody(), { enabled: true, maxTokens: 30 });
    const chunks = r.symbols
      .filter((s) => s.id.startsWith('a.py:big_fn#'))
      .map((s) => s.id)
      .sort();
    expect(chunks[0]).toBe('a.py:big_fn#0');
  });

  it('attributes calls inside a chunk to that chunk id', () => {
    const src = `
def big_fn():
    helper_a()
    helper_a()
    helper_a()
    helper_a()
    helper_a()
    helper_a()
    helper_b()
    helper_b()
    helper_b()
    helper_b()
    helper_b()
    helper_b()
    return 0

def helper_a():
    pass

def helper_b():
    pass
`;
    const r = parsePython('a.py', src, { enabled: true, maxTokens: 25 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.py:big_fn#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const callsFromChunk0 = r.calls.filter((c) => c.from === chunks[0].id);
    expect(callsFromChunk0.map((c) => c.toName)).toContain('helper_a');
  });

  it('does not chunk small methods even when chunking is on', () => {
    const src = `
class C:
    def small(self):
        return 1
`;
    const r = parsePython('a.py', src, { enabled: true, maxTokens: 50 });
    expect(r.symbols.find((s) => s.id === 'a.py:C.small')).toBeDefined();
    expect(r.symbols.filter((s) => s.id.startsWith('a.py:C.small#'))).toHaveLength(0);
  });
});

function bigBody(): string {
  return `
def big_fn():
    a = 0
    a += 1
    a += 2
    a += 3
    a += 4
    a += 5
    b = a * 2
    b -= 1
    b -= 2
    b -= 3
    c = a + b
    c *= 2
    c *= 3
    return c
`;
}
