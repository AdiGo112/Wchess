import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';

// ponytail: recommended rules only, no type-aware linting — `nest build` already
// typechecks. Add flat/recommended-type-checked if floating promises start biting.
export default [
  { ignores: ['dist/**', 'scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    rules: {
      // Prisma enum casts and Nest request objects use `any` on purpose; warn, don't block.
      '@typescript-eslint/no-explicit-any': 'warn',
      // ignoreRestSiblings: `const { passwordHash, ...safe } = user` is how secrets get stripped.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
