import { describe, it, expect } from 'vitest';
import { parseVueSfc } from '../../src/parsers/vue.js';

const SRC = `<script setup lang="ts">
export function useAuth(token: string): boolean {
  return token.length > 0;
}
</script>
<template><div /></template>
`;

describe('parseVueSfc signatures', () => {
  it('emits body-free signatures from a <script setup> block when opted in', () => {
    const { symbols } = parseVueSfc('a.vue', SRC, undefined, { signatures: true });
    const useAuth = symbols.find((s) => s.name === 'useAuth');
    expect(useAuth?.signature).toContain('useAuth(token: string): boolean');
    expect(useAuth?.signature).not.toContain('return token.length');
  });

  it('emits signatures from BOTH a plain <script> and a <script setup> block', () => {
    const src = `<script lang="ts">
export function helperA(x: number): number {
  return x + 1;
}
</script>
<script setup lang="ts">
export function helperB(y: string): string {
  return y.trim();
}
</script>
<template><div /></template>
`;
    const { symbols } = parseVueSfc('dual.vue', src, undefined, { signatures: true });
    const a = symbols.find((s) => s.name === 'helperA');
    const b = symbols.find((s) => s.name === 'helperB');
    expect(a?.signature).toContain('helperA(x: number): number');
    expect(a?.signature).not.toContain('return x + 1');
    expect(b?.signature).toContain('helperB(y: string): string');
    expect(b?.signature).not.toContain('return y.trim');
  });
});
