import { defineConfig } from 'vitest/config'
import path from 'path'

// Minimal config — these are plain unit tests over pure business logic
// (round-robin/assignment, phone matching, etc.), not component tests, so no
// jsdom/React plugin is needed. Mirrors the `@/*` alias from tsconfig.json
// so test files can import the same way app code does.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
