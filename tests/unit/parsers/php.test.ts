import { describe, it, expect } from 'vitest';
import { parsePhp } from '../../../src/parsers/php.js';

describe('parsePhp', () => {
  describe('symbol extraction', () => {
    it('extracts top-level function declarations', () => {
      const r = parsePhp('a.php', `<?php\nfunction login($u) { return $u; }`);
      const fn = r.symbols.find((s) => s.name === 'login');
      expect(fn?.kind).toBe('function');
      expect(fn?.id).toBe('a.php:login');
    });

    it('extracts class declarations', () => {
      const r = parsePhp('a.php', `<?php\nclass Auth {}`);
      expect(r.symbols.find((s) => s.name === 'Auth')?.kind).toBe('class');
    });

    it('extracts methods inside classes, qualified by class', () => {
      const src = `<?php
        class Auth {
          public function login($u) { return $u; }
          private function logout() {}
        }`;
      const r = parsePhp('a.php', src);
      const methods = r.symbols.filter((s) => s.kind === 'method');
      expect(methods.map((m) => m.name).sort()).toEqual(['login', 'logout']);
      expect(methods.every((m) => m.id.startsWith('a.php:Auth.'))).toBe(true);
    });

    it('extracts interface and trait declarations', () => {
      const src = `<?php
        interface AuthInterface {}
        trait Loggable {}`;
      const r = parsePhp('a.php', src);
      expect(r.symbols.find((s) => s.name === 'AuthInterface')?.kind).toBe('interface');
      expect(r.symbols.find((s) => s.name === 'Loggable')?.kind).toBe('class');
    });

    it('records line ranges', () => {
      const src = `<?php\nfunction a() {}\n\nfunction b() {}`;
      const r = parsePhp('a.php', src);
      const a = r.symbols.find((s) => s.name === 'a')!;
      const b = r.symbols.find((s) => s.name === 'b')!;
      expect(a.startLine).toBe(2);
      expect(b.startLine).toBe(4);
    });

    it('parses namespaced classes (namespace prefix tracked as file scope, not symbol id)', () => {
      const src = `<?php
        namespace App\\Auth;
        class Session {}`;
      const r = parsePhp('a.php', src);
      // We keep symbol ids file-scoped for cross-file consistency with TS/Py.
      expect(r.symbols.find((s) => s.id === 'a.php:Session')).toBeDefined();
    });
  });

  describe('import extraction (use statements)', () => {
    it('captures `use App\\Foo;`', () => {
      const r = parsePhp('a.php', `<?php\nuse App\\Foo;`);
      expect(r.imports).toHaveLength(1);
      expect(r.imports[0].source).toBe('App\\Foo');
      expect(r.imports[0].names).toContain('Foo');
    });

    it('captures `use App\\Foo as Bar;`', () => {
      const r = parsePhp('a.php', `<?php\nuse App\\Foo as Bar;`);
      expect(r.imports[0].namespace).toBe('Bar');
    });

    it('captures grouped use', () => {
      const r = parsePhp('a.php', `<?php\nuse App\\{Foo, Bar, Baz};`);
      const all = r.imports.flatMap((i) => i.names);
      expect(all).toContain('Foo');
      expect(all).toContain('Bar');
      expect(all).toContain('Baz');
    });
  });

  describe('call extraction', () => {
    it('records calls inside function bodies', () => {
      const src = `<?php
        function outer() {
          inner();
          helper();
        }
        function inner() {}
        function helper() {}`;
      const r = parsePhp('a.php', src);
      const calls = r.calls.filter((c) => c.from === 'a.php:outer');
      expect(calls.map((c) => c.toName).sort()).toEqual(['helper', 'inner']);
    });

    it('records method calls scoped to the enclosing method id', () => {
      const src = `<?php
        class Auth {
          public function login() { $this->validate(); helper(); }
          public function validate() {}
        }
        function helper() {}`;
      const r = parsePhp('a.php', src);
      const calls = r.calls.filter((c) => c.from === 'a.php:Auth.login');
      expect(calls.map((c) => c.toName).sort()).toEqual(['helper', 'validate']);
    });

    it('records static method calls', () => {
      const src = `<?php
        class Auth {
          public static function login() { Logger::write('hi'); }
        }`;
      const r = parsePhp('a.php', src);
      const calls = r.calls.filter((c) => c.from === 'a.php:Auth.login');
      expect(calls.map((c) => c.toName)).toContain('write');
    });

    it('returns empty result on broken syntax', () => {
      const r = parsePhp('a.php', `<?php\nfunction foo( !!!`);
      expect(r.symbols).toBeInstanceOf(Array);
      expect(r.calls).toBeInstanceOf(Array);
    });
  });

  describe('open tag flexibility', () => {
    it('handles files starting with `<?php` and trailing content', () => {
      const r = parsePhp('a.php', `<?php\nfunction foo() {}\n`);
      expect(r.symbols.find((s) => s.name === 'foo')).toBeDefined();
    });

    it('handles short-open-tag-style preamble', () => {
      const r = parsePhp('a.php', `<?php declare(strict_types=1);\nfunction foo() {}`);
      expect(r.symbols.find((s) => s.name === 'foo')).toBeDefined();
    });
  });
});
