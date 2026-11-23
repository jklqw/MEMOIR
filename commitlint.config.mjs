export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'security', 'docs', 'test', 'build', 'ci', 'chore', 'refactor'],
    ],
  },
};
