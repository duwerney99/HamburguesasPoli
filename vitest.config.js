import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/test/unit/**/*.test.js'],
    exclude: ['node_modules', 'dist']
  }
});

