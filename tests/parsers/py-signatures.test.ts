import { describe, it, expect } from 'vitest';
import { parsePython } from '../../src/parsers/py.js';

const SRC = `
def login(user, password):
    return user == password

class Auth:
    def check(self, token):
        return len(token) > 0
`;

describe('parsePython signatures', () => {
  it('emits body-free signatures when opted in', () => {
    const { symbols } = parsePython('a.py', SRC, undefined, { signatures: true });
    const login = symbols.find((s) => s.name === 'login');
    expect(login?.signature).toContain('def login(user, password)');
    expect(login?.signature).not.toContain('return user == password');
    const auth = symbols.find((s) => s.name === 'Auth');
    expect(auth?.signature).toContain('class Auth');
  });

  it('omits signature by default', () => {
    const { symbols } = parsePython('a.py', SRC);
    expect(symbols.every((s) => s.signature === undefined)).toBe(true);
  });

  it('strips the decorator and emits the inner def signature', () => {
    const src = '@login_required\ndef dashboard(request):\n    return render(request)\n';
    const { symbols } = parsePython('v.py', src, undefined, { signatures: true });
    const dash = symbols.find((s) => s.name === 'dashboard');
    expect(dash?.signature).toContain('def dashboard(request)');
    expect(dash?.signature).not.toContain('@login_required');
    expect(dash?.signature).not.toContain('return render');
  });

  it('emits a signature for an async def without its body', () => {
    const src = 'async def fetch_data(url):\n    return await get(url)\n';
    const { symbols } = parsePython('a.py', src, undefined, { signatures: true });
    const fetch = symbols.find((s) => s.name === 'fetch_data');
    expect(fetch?.signature).toContain('async def fetch_data(url)');
    expect(fetch?.signature).not.toContain('return await get');
  });

  it('emits a method signature without its body', () => {
    const { symbols } = parsePython('a.py', SRC, undefined, { signatures: true });
    const check = symbols.find((s) => s.name === 'check');
    expect(check?.signature).toContain('def check(self, token)');
    expect(check?.signature).not.toContain('return len(token)');
  });
});
