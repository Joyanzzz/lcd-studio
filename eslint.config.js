import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'build',
      '.tools',
      'src-tauri/target',
      'src-tauri/gen',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Prohibido evaluar código o construir funciones a partir de texto.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'No se permite HTML dinámico.',
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Sin estilos en línea: usa clases CSS.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'No se permite innerHTML.',
        },
        {
          selector: "MemberExpression[property.name='outerHTML']",
          message: 'No se permite outerHTML.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'No se permite insertAdjacentHTML.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'Usa notificaciones accesibles.' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Los fixtures de Playwright usan una función llamada `use` que no es un hook de React.
    files: ['tests/e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // Zod solo se usa configurado para la CSP (sin sondeo de `new Function`).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/zod.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: 'Importa `z` desde src/core/zod.ts (configurado para la CSP).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/pwa/sw-template.js'],
    languageOptions: { globals: { ...globals.serviceworker, __ASSETS__: 'readonly' } },
  },
);
