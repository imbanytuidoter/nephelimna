import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/artifacts/**",
      "**/cache/**",
      "**/coverage/**",
      "**/types/**",
      "**/typechain-types/**",
      "apps/sea/src/ocean/**",
      "apps/sea/src/main.js",
      "apps/site/site/vendor/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/sea/src/**/*.js", "apps/site/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["apps/site/site/tackle.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser, THREE: "readonly" } },
  },
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
