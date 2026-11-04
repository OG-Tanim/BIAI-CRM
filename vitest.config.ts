import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Route tests talk to a remote Neon branch; a cold connection can exceed
    // the default five seconds without anything being wrong.
    testTimeout: 20_000,
  },
});
