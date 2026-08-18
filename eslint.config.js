import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

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
            {
              // Path-shaped rather than alias-shaped, so the relative forms these
              // layers already use for their own siblings are caught too.
              group: ['**/ui', '**/ui/**', '**/services', '**/services/**'],
              message: 'domain/ and parsers/ must stay free of UI and I/O dependencies.',
            },
            {
              group: ['react', 'react/**', 'react-dom', 'react-dom/**'],
              message: 'domain/ and parsers/ are plain TypeScript and must not depend on React.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // no-restricted-imports never sees an import expression, so a dynamic
          // import would otherwise reach straight past the patterns above.
          selector: 'ImportExpression',
          message:
            'domain/ and parsers/ must not load another layer at run time; keep their imports static.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'domain/ and parsers/ must not touch the DOM.' },
        { name: 'document', message: 'domain/ and parsers/ must not touch the DOM.' },
        { name: 'navigator', message: 'domain/ and parsers/ must not touch the DOM.' },
        { name: 'fetch', message: 'Network access belongs in services/.' },
        { name: 'XMLHttpRequest', message: 'Network access belongs in services/.' },
        { name: 'localStorage', message: 'Storage access belongs in services/.' },
        { name: 'sessionStorage', message: 'Storage access belongs in services/.' },
        { name: 'indexedDB', message: 'Storage access belongs in services/.' },
        { name: 'process', message: 'domain/ and parsers/ run in the browser, not in Node.' },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
