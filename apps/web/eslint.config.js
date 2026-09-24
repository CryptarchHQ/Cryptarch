import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const frontFiles = ["src/**/*.{js,jsx}", "../../packages/shared/src/**/*.js"];

const reactRecommended = react.configs.flat.recommended;

export default [
  js.configs.recommended,
  {
    ignores: ["dist", "node_modules", "coverage"],
  },
  {
    files: [
      "eslint.config.js",
      "vite.config.js",
      "playwright.config.js",
    ],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: frontFiles,
    plugins: reactRecommended.plugins,
    languageOptions: {
      ...reactRecommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
    rules: {
      ...reactRecommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/prop-types": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    files: frontFiles,
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["src/**/*.test.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
        ...globals.node,
      },
    },
  },
  eslintConfigPrettier,
];
