const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['node_modules/*', 'dist/*', 'android/*', 'ios/*', '.expo/*', 'coverage/*', 'docs/*'] },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
]);
