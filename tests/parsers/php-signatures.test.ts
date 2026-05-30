import { describe, it, expect } from 'vitest';
import { parsePhp } from '../../src/parsers/php.js';

const SRC = `<?php
function login($user, $pass) {
    return $user === $pass;
}
class Auth {
    public function check($token) { return strlen($token) > 0; }
}
`;

describe('parsePhp signatures', () => {
  it('emits body-free signatures when opted in', () => {
    const { symbols } = parsePhp('a.php', SRC, undefined, { signatures: true });
    const login = symbols.find((s) => s.name === 'login');
    expect(login?.signature).toContain('function login($user, $pass)');
    expect(login?.signature).not.toContain('return $user === $pass');
  });

  it('omits signature by default', () => {
    const { symbols } = parsePhp('a.php', SRC);
    expect(symbols.every((s) => s.signature === undefined)).toBe(true);
  });

  it('includes the visibility modifier and elides the method body', () => {
    const { symbols } = parsePhp('a.php', SRC, undefined, { signatures: true });
    const check = symbols.find((s) => s.name === 'check');
    expect(check?.signature).toContain('public function check($token)');
    expect(check?.signature).not.toContain('strlen');
  });

  it('emits the full interface body as the contract', () => {
    const src = '<?php\ninterface Greeter {\n    public function greet(string $name): string;\n}\n';
    const { symbols } = parsePhp('i.php', src, undefined, { signatures: true });
    const iface = symbols.find((s) => s.name === 'Greeter');
    expect(iface?.signature).toContain('interface Greeter');
    expect(iface?.signature).toContain('greet(string $name): string');
  });

  it('emits a first-line signature for an abstract method with no body', () => {
    const src = '<?php\nabstract class Base {\n    abstract public function run(): void;\n}\n';
    const { symbols } = parsePhp('b.php', src, undefined, { signatures: true });
    const run = symbols.find((s) => s.name === 'run');
    expect(run?.signature).toContain('abstract public function run(): void');
  });
});
