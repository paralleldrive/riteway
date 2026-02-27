import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['source/e2e.test.js'],
    testTimeout: 300000
  }
});
