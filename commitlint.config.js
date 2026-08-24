export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['domain', 'parsers', 'services', 'enrich', 'ui', 'e2e', 'deps', 'ci', 'docs'],
    ],
  },
};
