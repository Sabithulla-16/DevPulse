const tsParser = require('@typescript-eslint/parser');
module.exports = [
  { ignores: ['out/**', 'node_modules/**', 'webview/dist/**'] },
  {
    files: ['src/**/*.ts', 'webview/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    rules: { 'no-debugger': 'error', 'no-constant-condition': 'error' }
  }
];
