import { describe, it, expect } from 'vitest';
import { parsePython } from '../../../src/parsers/py.js';

describe('parsePython', () => {
  describe('symbol extraction', () => {
    it('extracts function definitions', () => {
      const r = parsePython('a.py', `def login(user):\n    return user`);
      const fn = r.symbols.find((s) => s.name === 'login');
      expect(fn?.kind).toBe('function');
      expect(fn?.id).toBe('a.py:login');
    });

    it('extracts class definitions', () => {
      const r = parsePython('a.py', `class Session:\n    pass`);
      expect(r.symbols.find((s) => s.name === 'Session')?.kind).toBe('class');
    });

    it('extracts methods inside classes, qualified by class name', () => {
      const src = `class Auth:
    def login(self, u):
        return u
    def logout(self):
        pass`;
      const r = parsePython('a.py', src);
      const methods = r.symbols.filter((s) => s.kind === 'method');
      expect(methods.map((m) => m.name).sort()).toEqual(['login', 'logout']);
      expect(methods.every((m) => m.id.startsWith('a.py:Auth.'))).toBe(true);
    });

    it('extracts decorated functions and methods', () => {
      const src = `@cache
def get_user(id):
    return id

class Api:
    @staticmethod
    def factory():
        pass`;
      const r = parsePython('a.py', src);
      expect(r.symbols.find((s) => s.name === 'get_user')).toBeDefined();
      expect(r.symbols.find((s) => s.id === 'a.py:Api.factory')).toBeDefined();
    });

    it('records line ranges', () => {
      const src = `def a():\n    pass\n\ndef b():\n    pass`;
      const r = parsePython('a.py', src);
      const a = r.symbols.find((s) => s.name === 'a')!;
      const b = r.symbols.find((s) => s.name === 'b')!;
      expect(a.startLine).toBe(1);
      expect(b.startLine).toBe(4);
    });
  });

  describe('import extraction', () => {
    it('captures `from X import Y, Z`', () => {
      const r = parsePython('a.py', `from .session import create_session, destroy`);
      expect(r.imports).toHaveLength(1);
      const imp = r.imports[0];
      expect(imp.source).toBe('.session');
      expect(imp.names.sort()).toEqual(['create_session', 'destroy']);
    });

    it('captures `import X`', () => {
      const r = parsePython('a.py', `import os\nimport json as j`);
      const sources = r.imports.map((i) => i.source).sort();
      expect(sources).toEqual(['json', 'os']);
      expect(r.imports.find((i) => i.source === 'json')?.namespace).toBe('j');
    });

    it('handles relative imports `from . import X`', () => {
      const r = parsePython('pkg/sub.py', `from . import login`);
      expect(r.imports[0].source).toBe('.');
      expect(r.imports[0].names).toContain('login');
    });
  });

  describe('call extraction', () => {
    it('records calls scoped to the enclosing function', () => {
      const src = `def outer():
    inner()
    helper()

def inner():
    pass

def helper():
    pass`;
      const r = parsePython('a.py', src);
      const calls = r.calls.filter((c) => c.from === 'a.py:outer');
      expect(calls.map((c) => c.toName).sort()).toEqual(['helper', 'inner']);
    });

    it('records method calls (attribute access)', () => {
      const src = `class A:
    def login(self):
        self.validate()
        helper()
    def validate(self):
        pass

def helper():
    pass`;
      const r = parsePython('a.py', src);
      const calls = r.calls.filter((c) => c.from === 'a.py:A.login');
      expect(calls.map((c) => c.toName).sort()).toEqual(['helper', 'validate']);
    });

    it('returns empty result on broken syntax', () => {
      const r = parsePython('a.py', `def foo( !!!`);
      expect(r.symbols).toBeInstanceOf(Array);
      expect(r.calls).toBeInstanceOf(Array);
    });
  });
});
