import { describe, it, expect } from 'vitest';
import { parsePhp } from '../../../src/parsers/php.js';

describe('parsePhp — sub-symbol chunking', () => {
  it('does not chunk when chunkOptions are omitted', () => {
    const r = parsePhp('a.php', bigPhp());
    expect(r.symbols.filter((s) => s.id.startsWith('a.php:bigFn'))).toHaveLength(1);
  });

  it('chunks a PHP function exceeding maxTokens', () => {
    const r = parsePhp('a.php', bigPhp(), { enabled: true, maxTokens: 30 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.php:bigFn#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(r.symbols.find((s) => s.id === 'a.php:bigFn')).toBeUndefined();
  });

  it('chunks methods qualified by class', () => {
    const src = `<?php
class Auth {
  public function big() {
    foo(); foo(); foo();
    bar(); bar(); bar();
    baz(); baz(); baz();
    quux(); quux(); quux();
    return true;
  }
}`;
    const r = parsePhp('a.php', src, { enabled: true, maxTokens: 30 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.php:Auth.big#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('attributes calls inside a chunk to that chunk id', () => {
    const src = `<?php
function bigFn() {
  helperA(); helperA(); helperA(); helperA();
  helperB(); helperB(); helperB(); helperB();
  return 0;
}
function helperA() {}
function helperB() {}`;
    const r = parsePhp('a.php', src, { enabled: true, maxTokens: 25 });
    const chunks = r.symbols.filter((s) => s.id.startsWith('a.php:bigFn#'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const callsFromChunk0 = r.calls.filter((c) => c.from === chunks[0].id);
    expect(callsFromChunk0.map((c) => c.toName)).toContain('helperA');
  });

  it('does not chunk small functions even when chunking is on', () => {
    const r = parsePhp('a.php', `<?php\nfunction small() { return 1; }`, {
      enabled: true,
      maxTokens: 50,
    });
    expect(r.symbols.find((s) => s.id === 'a.php:small')).toBeDefined();
    expect(r.symbols.filter((s) => s.id.startsWith('a.php:small#'))).toHaveLength(0);
  });
});

function bigPhp(): string {
  return `<?php
function bigFn() {
  $a = 0;
  $a += 1;
  $a += 2;
  $a += 3;
  $a += 4;
  $b = $a * 2;
  $b -= 1;
  $b -= 2;
  $b -= 3;
  $c = $a + $b;
  $c *= 2;
  return $c;
}`;
}
