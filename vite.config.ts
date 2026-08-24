import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { faviconPlugin } from './vite-plugins/favicon';

export default defineConfig({
  // GitHub Pages serves the project at /cinetier/, local dev at /.
  base: process.env.GITHUB_ACTIONS ? '/cinetier/' : '/',
  plugins: [react(), tailwindcss(), faviconPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Pinned to a negative-offset zone so a date test that only distinguishes
    // local midnight from UTC midnight east of Greenwich (or at UTC itself)
    // actually discriminates, here and in CI.
    env: { TZ: 'America/New_York' },
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: [
            'tests/domain/**/*.test.ts',
            'tests/parsers/**/*.test.ts',
            'tests/styles/**/*.test.ts',
            'src/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: [
            'tests/ui/**/*.test.tsx',
            'tests/ui/**/*.test.ts',
            'tests/services/**/*.test.ts',
            'tests/enrich/**/*.test.ts',
          ],
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/parsers/**', 'src/services/**', 'src/enrich/**', 'src/ui/**'],
      // The definition of done for the pure layers, enforced by CI rather than
      // by a sentence in a document.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
