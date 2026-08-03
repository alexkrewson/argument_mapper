import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // android/ holds Gradle build artifacts (generated native-bridge.js etc.) —
  // linting them buries real findings under hundreds of errors once an APK has
  // been built. test-results/ is generated too.
  globalIgnores(['dist', 'android', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Substituted at build time by vite.config.js's `define` — the commit
        // the bundle was built from, used as the Sentry release.
        __APP_RELEASE__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ignoreRestSiblings: the codebase drops metadata keys via
      // `const { agreed_by, ...rest } = meta` — those bindings are unused on
      // purpose and are not dead code.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true, caughtErrors: 'none' },
      ],
    },
  },
  {
    files: [
      'tests/**/*.{js,mjs}',
      'scripts/**/*.mjs',
      'playwright.config.js',
      'vite.config.js',
      'eslint.config.js',
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
])
