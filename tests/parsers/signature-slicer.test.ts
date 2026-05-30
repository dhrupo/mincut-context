import { describe, it, expect } from 'vitest';
import { sliceSignature } from '../../src/parsers/parser.js';

describe('sliceSignature', () => {
  const src =
    'export function add(a: number, b: number): number {\n  return a + b;\n}\n';

  it('keeps a function header and elides the body', () => {
    const node = { startIndex: 0, endIndex: src.length };
    const body = { startIndex: src.indexOf('{') };
    const sig = sliceSignature(src, node, body, 'function');
    expect(sig).toBe('export function add(a: number, b: number): number { /* … */ }');
    expect(sig).not.toContain('return a + b');
  });

  it('returns the full text for interfaces (they are the contract)', () => {
    const i = 'interface User { id: string; name: string }';
    const node = { startIndex: 0, endIndex: i.length };
    expect(sliceSignature(i, node, null, 'interface')).toBe(i);
  });

  it('returns only the first line for a variable with no body', () => {
    const v = 'export const TIMEOUT = 5000;\nconst other = 1;';
    const node = { startIndex: 0, endIndex: v.length };
    expect(sliceSignature(v, node, null, 'variable')).toBe('export const TIMEOUT = 5000;');
  });

  it('elides the body for a class', () => {
    const c = 'class Auth {\n  check() { return true; }\n}';
    const node = { startIndex: 0, endIndex: c.length };
    const body = { startIndex: c.indexOf('{') };
    expect(sliceSignature(c, node, body, 'class')).toBe('class Auth { /* … */ }');
  });

  it('returns full text for a type alias (full-text branch, not first-line)', () => {
    const t = 'type Fn = (a: string) => void';
    const node = { startIndex: 0, endIndex: t.length };
    expect(sliceSignature(t, node, null, 'type')).toBe(t);
  });

  it('returns full text for an interface even when a body node is supplied (guard precedence)', () => {
    const i = 'interface User { id: string }';
    const node = { startIndex: 0, endIndex: i.length };
    const body = { startIndex: i.indexOf('{') };
    expect(sliceSignature(i, node, body, 'interface')).toBe(i);
  });
});
