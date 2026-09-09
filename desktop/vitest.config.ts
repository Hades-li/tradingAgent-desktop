import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Frontend tests live next to their source (`src/**/*.test.ts`) and stay out of
// `tests/`, which pytest owns.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
