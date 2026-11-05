import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/test/e2e/**/*.e2e.test.js', 'server/test/api.test.js'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 15000
  }
});

