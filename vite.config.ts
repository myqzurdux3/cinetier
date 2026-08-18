import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // GitHub Pages serves the project at /cinetier/, local dev at /.
  base: process.env.GITHUB_ACTIONS ? '/cinetier/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/parsers/**'],
      // The definition of done for the pure layers, enforced by CI rather than
      // by a sentence in a document.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
