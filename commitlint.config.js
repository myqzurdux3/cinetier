export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['domain', 'parsers', 'services', 'ui', 'deps', 'ci', 'docs']],
  },
};
