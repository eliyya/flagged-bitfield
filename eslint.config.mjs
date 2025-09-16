import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import nodePlugin from 'eslint-plugin-node'
import prettierPlugin from 'eslint-plugin-prettier'
import securityPlugin from 'eslint-plugin-security'
import * as tseslint from 'typescript-eslint'

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        ignores: ['node_modules/**'],
    },
    js.configs.recommended,
    // Configuración recomendada de TypeScript-ESLint (ya incluye parser, plugins y reglas)
    ...tseslint.configs.recommended,

    // Reglas adicionales que quieras sobreescribir o añadir
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },

    // Prettier y reglas de importación (siempre al final)
    {
        plugins: {
            prettier: prettierPlugin,
            import: importPlugin,
            node: nodePlugin,
            security: securityPlugin,
        },
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true, // 👈 opcional: también busca en @types
                    project: './tsconfig.json',
                },
            },
        },
        rules: {
            ...prettierConfig.rules,
            ...securityPlugin.configs.recommended.rules,
            'prettier/prettier': [
                'error',
                { endOfLine: 'auto', parser: 'typescript' },
            ],
            'import/extensions': [
                'error',
                'ignorePackages',
                {
                    js: 'never',
                    ts: 'always',
                },
            ],
            'import/no-unresolved': 'error',
            'import/order': [
                'error',
                {
                    groups: [
                        'builtin', // node_modules de Node
                        'external', // paquetes npm
                        'internal', // imports relativos a tu src (paths de tsconfig)
                        'parent', // ../ algo
                        'sibling', // ./algo
                        'index', // ./index
                    ],
                    'newlines-between': 'always',
                    alphabetize: { order: 'asc', caseInsensitive: true },
                },
            ],
            'import/newline-after-import': 'error',
            'import/no-duplicates': 'error',
            'import/no-self-import': 'error',
            'import/no-dynamic-require': 'error',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'node/no-missing-import': [
                'error',
                {
                    allowModules: ['typescript-eslint'],
                },
            ],
            'node/no-extraneous-import': 'error',
        },
    },
]
