const js = require('@eslint/js');
const react = require('eslint-plugin-react');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2017,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        // Browser environment
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        // CommonJS environment
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        process: 'readonly',
        // ES6 environment
        Promise: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        Symbol: 'readonly',
        // Node.js timer functions
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
      }
    },
    plugins: {
      react
    },
    rules: Object.assign({}, react.configs.recommended.rules, {
      'indent': ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always']
    }),
    settings: {
      react: {
        version: 'detect'
      }
    }
  }
];
