import tseslint from "typescript-eslint";

/**
 * Flat config (ESLint 9). TypeScript-focused lint: catches unused code,
 * unsafe syntax and accidental `any` leakage without stylistic noise
 * (prettier is the formatter of record, not ESLint).
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "tests/.pgdata-test/**",
      "scripts/**",
    ],
  },
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
);
