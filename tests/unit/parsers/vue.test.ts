import { describe, it, expect } from 'vitest';
import { parseVueSfc } from '../../../src/parsers/vue.js';

describe('parseVueSfc', () => {
  it('extracts symbols from <script> block (Vue 2 / Options API)', () => {
    const src = `<template>
  <div>{{ msg }}</div>
</template>

<script>
export default {
  data() { return { msg: 'hi' }; },
  methods: {
    login(u) { return u; },
  }
}

function helper() { return 1; }
</script>

<style scoped>
div { color: red }
</style>`;
    const r = parseVueSfc('Foo.vue', src);
    expect(r.symbols.find((s) => s.name === 'helper')).toBeDefined();
  });

  it('extracts symbols from <script setup> (Vue 3 Composition API)', () => {
    const src = `<template><button @click="login">go</button></template>

<script setup>
import { ref } from 'vue';
import { useAuth } from './auth';

const auth = useAuth();
function login() { auth.signIn(); }
function logout() { auth.signOut(); }
</script>`;
    const r = parseVueSfc('Foo.vue', src);
    expect(r.symbols.find((s) => s.name === 'login')).toBeDefined();
    expect(r.symbols.find((s) => s.name === 'logout')).toBeDefined();
  });

  it('captures imports inside the script block', () => {
    const src = `<template></template>

<script setup>
import { ref, computed } from 'vue';
import authHelper from '../utils/auth';
</script>`;
    const r = parseVueSfc('Foo.vue', src);
    const sources = r.imports.map((i) => i.source).sort();
    expect(sources).toContain('../utils/auth');
    expect(sources).toContain('vue');
  });

  it('reports source line numbers relative to the SFC file, not the script', () => {
    // Function definition is on line 7 of the SFC (1-indexed).
    const src = `<template>
  <div />
</template>

<script>
// comment
function login() { return 1; }
</script>`;
    const r = parseVueSfc('Foo.vue', src);
    const fn = r.symbols.find((s) => s.name === 'login');
    expect(fn?.startLine).toBe(7);
  });

  it('handles SFC with no script block (template-only)', () => {
    const src = `<template><div>hello</div></template>`;
    const r = parseVueSfc('Foo.vue', src);
    expect(r.symbols).toEqual([]);
    expect(r.imports).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  it('handles both <script> and <script setup> in the same SFC', () => {
    const src = `<template></template>

<script>
export default { name: 'X' }
function legacyHelper() {}
</script>

<script setup>
function setupHelper() {}
</script>`;
    const r = parseVueSfc('Foo.vue', src);
    expect(r.symbols.find((s) => s.name === 'legacyHelper')).toBeDefined();
    expect(r.symbols.find((s) => s.name === 'setupHelper')).toBeDefined();
  });

  it('honors lang="ts" on the script block', () => {
    const src = `<template></template>

<script setup lang="ts">
import type { User } from './types';
function login(u: User): boolean { return Boolean(u); }
</script>`;
    const r = parseVueSfc('Foo.vue', src);
    expect(r.symbols.find((s) => s.name === 'login')).toBeDefined();
    expect(r.imports.find((i) => i.source === './types')).toBeDefined();
  });

  it('records call edges from script-scope functions', () => {
    const src = `<template></template>

<script setup>
import { api } from './api';
function login() { api.post('/login'); helper(); }
function helper() {}
</script>`;
    const r = parseVueSfc('Foo.vue', src);
    const calls = r.calls.filter((c) => c.from === 'Foo.vue:login');
    expect(calls.map((c) => c.toName)).toContain('helper');
  });
});
