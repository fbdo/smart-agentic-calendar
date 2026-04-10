import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  sonarjs.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // SonarQube-equivalent rules via sonarjs plugin are enabled by default.
      // Adjust severity or disable specific rules as needed:
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 3 }],

      // TypeScript strict additions
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "sonarjs/no-duplicate-string": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    ignores: [
      "dist/",
      "node_modules/",
      "aidlc-docs/",
      "aidlc-rule-details",
      "coverage/",
      "*.js",
      "*.cjs",
      "*.mjs",
    ],
  }
);
