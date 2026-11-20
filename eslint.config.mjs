import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/.expo/**',
      'packages/core/src/types/database.ts',
    ],
  },
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
