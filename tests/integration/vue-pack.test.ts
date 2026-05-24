import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';
import { indexRepo } from '../../src/index/builder.js';

describe('Vue SFC — end-to-end', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-vue-'));
    await mkdir(path.join(root, 'src/auth'), { recursive: true });
    await mkdir(path.join(root, 'src/ui'), { recursive: true });

    // Options API style (Vue 2 / Vue 3 compatible)
    await writeFile(
      path.join(root, 'src/auth/LoginForm.vue'),
      `<template>
  <form @submit.prevent="login">
    <input v-model="email" />
  </form>
</template>

<script>
import { validateEmail } from './validators';

export default {
  data() { return { email: '' } },
  methods: {
    login() {
      if (validateEmail(this.email)) {
        this.$emit('login', this.email);
      }
    }
  }
}

function privateHelper() { return 1; }
</script>`,
    );

    await writeFile(
      path.join(root, 'src/auth/validators.ts'),
      `export function validateEmail(s: string) { return s.includes('@'); }`,
    );

    // <script setup> Vue 3 style
    await writeFile(
      path.join(root, 'src/auth/SessionWidget.vue'),
      `<template><span>{{ status }}</span></template>

<script setup>
import { ref, computed } from 'vue';
import { fetchSession } from './session-api';

const status = ref('idle');
function refresh() { return fetchSession(); }
function logout() { status.value = 'idle'; }
</script>`,
    );

    await writeFile(
      path.join(root, 'src/auth/session-api.ts'),
      `export function fetchSession() { return null; }`,
    );

    // Unrelated UI for cohesion test
    await writeFile(
      path.join(root, 'src/ui/Dashboard.vue'),
      `<template><div>dashboard</div></template>
<script>
export default {
  methods: { renderDashboard() { return 'dash'; } }
}
function dashboardHelper() {}
</script>`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('indexes Vue SFCs alongside .ts files', () => {
    const { graph, stats } = indexRepo(root);
    expect(stats.files).toBeGreaterThan(0);
    expect(graph.nodes().some((id) => id.endsWith(':privateHelper'))).toBe(true);
    expect(graph.nodes().some((id) => id.endsWith(':refresh'))).toBe(true);
    expect(graph.nodes().some((id) => id.endsWith(':logout'))).toBe(true);
  });

  it('resolves imports from .vue files into .ts files', () => {
    const { graph } = indexRepo(root);
    // SessionWidget.vue → fetchSession (in session-api.ts).  The refresh function
    // in the SFC should have a graph edge to fetchSession.
    const refreshId = graph.nodes().find((id) => id.endsWith('SessionWidget.vue:refresh'))!;
    const targets = graph
      .outNeighbors(refreshId)
      .map((id) => id.split(':').slice(1).join(':'));
    expect(targets).toContain('fetchSession');
  });

  it('packs the auth cluster for an auth task including .vue files', async () => {
    const result = await pack({ task: 'login email validation', repo: root, budget: 800 });
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.endsWith('.vue'))).toBe(true);
    expect(paths.every((p) => !p.includes('Dashboard'))).toBe(true);
  });

  it('symbol line ranges in .vue files reflect SFC-level lines', () => {
    const { graph } = indexRepo(root);
    const helperId = graph.nodes().find((id) => id.endsWith('LoginForm.vue:privateHelper'))!;
    const data = graph.getNode(helperId)!;
    // privateHelper is on line ~20 of LoginForm.vue (after template + script block).
    expect(data.startLine).toBeGreaterThan(15);
  });
});
