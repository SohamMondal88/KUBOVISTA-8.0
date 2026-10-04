import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "assets/**",
      ".firebase-local/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-binary-expression": "error",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      eqeqeq: ["warn", "always"],
    },
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
];
