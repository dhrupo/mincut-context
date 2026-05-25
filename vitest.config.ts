import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/adapters/cli/bin.ts',           // CLI entry — covered by integration tests, hard for instrumented coverage
        'src/**/*.d.ts',
        'src/index/parse-worker.ts',         // separate worker process — not visible to coverage
        'src/seeds/transformers-embedder.ts', // lazy-loaded heavy dep, exercised in eval only
        'src/lsp/stdio-client.ts',           // requires a real LSP binary to exercise
        'src/lsp/typescript.ts',             // thin factory, exercised by integration only
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 85,
      },
    },
  },
});
