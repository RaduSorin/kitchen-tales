import { defineConfig } from 'vitest/config'

// Unit tests for the logic that needs no browser or AWS (see test/). Run with `npm test`.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})
