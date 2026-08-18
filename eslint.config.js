import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The architectural rule from the spec, enforced rather than documented.
    files: ['src/domain/**/*.ts', 'src/parsers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/ui/*', '@/services/*', 'react', 'react-dom'],
              message: 'domain/ and parsers/ must stay free of UI and I/O dependencies.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'domain/ and parsers/ must not touch the DOM.' },
        { name: 'fetch', message: 'Network access belongs in services/.' },
        { name: 'localStorage', message: 'Storage access belongs in services/.' },
      ],
    },
  },
);
