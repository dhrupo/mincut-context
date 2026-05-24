import { describe, it, expect } from 'vitest';
import { parseTypeScript } from '../../../src/parsers/ts.js';

describe('parseTypeScript', () => {
  describe('symbol extraction', () => {
    it('extracts function declarations', () => {
      const result = parseTypeScript('a.ts', `function login(user: string) { return user; }`);
      const fn = result.symbols.find((s) => s.name === 'login');
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe('function');
      expect(fn!.file).toBe('a.ts');
      expect(fn!.id).toBe('a.ts:login');
      expect(fn!.tokens).toBeGreaterThan(0);
    });

    it('extracts arrow functions assigned to const', () => {
      const result = parseTypeScript('a.ts', `const validate = (x: number) => x > 0;`);
      expect(result.symbols.find((s) => s.name === 'validate')?.kind).toBe('function');
    });

    it('extracts class declarations and their methods', () => {
      const src = `
        class Session {
          create(userId: string) { return userId; }
          destroy() { return null; }
        }
      `;
      const result = parseTypeScript('a.ts', src);
      const cls = result.symbols.find((s) => s.name === 'Session');
      expect(cls?.kind).toBe('class');
      const methods = result.symbols.filter((s) => s.kind === 'method');
      expect(methods.map((m) => m.name).sort()).toEqual(['create', 'destroy']);
      // Methods qualified by class.
      expect(methods.every((m) => m.id.includes('Session.'))).toBe(true);
    });

    it('extracts interface and type alias declarations', () => {
      const src = `
        interface User { id: string }
        type Token = string;
      `;
      const result = parseTypeScript('a.ts', src);
      expect(result.symbols.find((s) => s.name === 'User')?.kind).toBe('interface');
      expect(result.symbols.find((s) => s.name === 'Token')?.kind).toBe('type');
    });

    it('records line ranges for each symbol', () => {
      const src = `function a() {}\nfunction b() {}`;
      const result = parseTypeScript('a.ts', src);
      const a = result.symbols.find((s) => s.name === 'a')!;
      const b = result.symbols.find((s) => s.name === 'b')!;
      expect(a.startLine).toBe(1);
      expect(a.endLine).toBe(1);
      expect(b.startLine).toBe(2);
    });

    it('parses TSX files (JSX inside TypeScript)', () => {
      const src = `function Button() { return <button>click</button>; }`;
      const result = parseTypeScript('a.tsx', src);
      expect(result.symbols.find((s) => s.name === 'Button')?.kind).toBe('function');
    });
  });

  describe('import extraction', () => {
    it('captures named imports with the source path', () => {
      const result = parseTypeScript(
        'src/auth/login.ts',
        `import { createSession, destroy } from './session';`,
      );
      expect(result.imports).toHaveLength(1);
      const imp = result.imports[0];
      expect(imp.source).toBe('./session');
      expect(imp.names.sort()).toEqual(['createSession', 'destroy']);
    });

    it('captures default and namespace imports', () => {
      const result = parseTypeScript(
        'a.ts',
        `import lodash from 'lodash';\nimport * as utils from './utils';`,
      );
      expect(result.imports).toHaveLength(2);
      const lodash = result.imports.find((i) => i.source === 'lodash')!;
      expect(lodash.names).toContain('lodash');
      const utils = result.imports.find((i) => i.source === './utils')!;
      expect(utils.namespace).toBe('utils');
    });
  });

  describe('call extraction', () => {
    it('records calls inside a function body, scoped to the caller', () => {
      const src = `
        function outer() {
          inner();
          helper();
        }
        function inner() {}
        function helper() {}
      `;
      const result = parseTypeScript('a.ts', src);
      const calls = result.calls.filter((c) => c.from === 'a.ts:outer');
      expect(calls.map((c) => c.toName).sort()).toEqual(['helper', 'inner']);
    });

    it('records calls inside class methods, scoped to method id', () => {
      const src = `
        class Auth {
          login() { this.validate(); helper(); }
          validate() {}
        }
        function helper() {}
      `;
      const result = parseTypeScript('a.ts', src);
      const calls = result.calls.filter((c) => c.from === 'a.ts:Auth.login');
      expect(calls.map((c) => c.toName)).toContain('helper');
    });

    it('ignores calls inside type contexts', () => {
      const src = `type X = ReturnType<typeof foo>;`;
      const result = parseTypeScript('a.ts', src);
      expect(result.calls).toHaveLength(0);
    });
  });

  describe('robustness', () => {
    it('returns empty result for unparseable input without throwing', () => {
      const result = parseTypeScript('a.ts', `function {{{ broken`);
      expect(result.symbols).toBeInstanceOf(Array);
      expect(result.imports).toBeInstanceOf(Array);
      expect(result.calls).toBeInstanceOf(Array);
    });

    it('selects the TSX grammar by file extension', () => {
      const tsx = parseTypeScript('a.tsx', `const X = <div />;`);
      // Bare `<div />` would fail in plain TS grammar; it must parse cleanly as TSX.
      expect(tsx.symbols.find((s) => s.name === 'X')).toBeDefined();
    });
  });
});
