import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      // Exclude bin/riteway.test.js as it uses Tape instead of Vitest
      '**/bin/riteway.test.js',
      // Exclude bun.test.js as it uses bun:test instead of Vitest
      '**/bun.test.js'
    ]
  }
});

