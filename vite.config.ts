import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  test: {
    coverage: {
      exclude: [
        'coverage/**',
        'dist/**',
        'eslint.config.js',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/test/**',
        'src/types.ts',
        'src/vite-env.d.ts',
        'src/workers/**',
        'vite.config.ts',
      ],
      reporter: ['text', 'json-summary'],
    },
    environment: 'node',
  },
})
