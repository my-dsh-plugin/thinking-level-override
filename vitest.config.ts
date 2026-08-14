import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin } from '../deepseek-harness/vitest.shared.ts'

export default defineConfig({
  // Harness source uses standard TypeScript decorators, which Vite's default
  // parser rejects; reuse the sibling checkout's pre-transform.
  plugins: [standardDecoratorPlugin(), tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
      '../deepseek-harness/tsconfig.base.json',
    ],
  })],
  resolve: {
    // Keep one Cordis runtime identity across this package and harness source.
    alias: {
      '@deepseek-ai/cordis': fileURLToPath(new URL('../deepseek-harness/vendor/cordis/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    pool: 'forks',
  },
})
