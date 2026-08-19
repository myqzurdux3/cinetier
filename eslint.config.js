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
    // .tsx as well as .ts: neither layer has a component in it today, and the
    // rule is what keeps it that way rather than the current file listing.
    files: ['src/domain/**/*.{ts,tsx}', 'src/parsers/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Path-shaped rather than alias-shaped, so the relative forms these
              // layers already use for their own siblings are caught too.
              group: [
                '**/ui',
                '**/ui/**',
                '**/services',
                '**/services/**',
                '**/enrich',
                '**/enrich/**',
              ],
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
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/logoMark.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Every colour belongs to a theme, and a literal belongs to neither.
          // logoMark.ts is exempt: a favicon data URI cannot read a CSS variable,
          // so the mark's literal values live there and nowhere else.
          selector:
            "Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\brgba?\\(|\\bhsla?\\(/]",
          message:
            'Colours come from theme tokens, never literals — add a token in src/index.css.',
        },
      ],
    },
  },
);
