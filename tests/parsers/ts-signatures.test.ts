import { describe, it, expect } from 'vitest';
import { parseTypeScript } from '../../src/parsers/ts.js';

const SRC = `
export function login(user: string, pass: string): boolean {
  return user === pass;
}
export interface Session { id: string; user: string }
export class Auth {
  check(token: string): boolean { return token.length > 0; }
}
`;

describe('parseTypeScript signatures', () => {
  it('omits signature by default', () => {
    const { symbols } = parseTypeScript('a.ts', SRC);
    expect(symbols.every((s) => s.signature === undefined)).toBe(true);
  });

  it('emits body-free signatures when opted in', () => {
    const { symbols } = parseTypeScript('a.ts', SRC, undefined, { signatures: true });
    const login = symbols.find((s) => s.name === 'login');
    expect(login?.signature).toContain('login(user: string, pass: string): boolean');
    expect(login?.signature).not.toContain('return user === pass');

    const session = symbols.find((s) => s.name === 'Session');
    expect(session?.signature).toContain('id: string');

    const auth = symbols.find((s) => s.name === 'Auth');
    expect(auth?.signature).toContain('class Auth');
    expect(auth?.signature).not.toContain('return token.length');
  });

  it('extracts a method signature without its body', () => {
    const { symbols } = parseTypeScript('a.ts', SRC, undefined, { signatures: true });
    const check = symbols.find((s) => s.name === 'check');
    expect(check?.signature).toBeDefined();
    expect(check?.signature).toContain('check(token: string): boolean');
    expect(check?.signature).not.toContain('return token.length');
  });

  it('emits the full text for a type alias', () => {
    const src = 'export type UserId = string;\n';
    const { symbols } = parseTypeScript('t.ts', src, undefined, { signatures: true });
    const t = symbols.find((s) => s.name === 'UserId');
    expect(t?.signature).toContain('type UserId = string');
  });

  it('emits first-line signature for arrow-function-assigned-to-const', () => {
    const src = 'export const greet = (name: string): string => {\n  return "hi " + name;\n};\n';
    const { symbols } = parseTypeScript('a.ts', src, undefined, { signatures: true });
    const greet = symbols.find((s) => s.name === 'greet');
    // variable_declarator has no 'body' field, so sliceSignature takes the first-line
    // fallback branch — documents the actual (acceptable) lossy behavior for regression detection.
    expect(greet?.signature).toBe('greet = (name: string): string => {');
    expect(greet?.signature).not.toContain('return');
  });
});
