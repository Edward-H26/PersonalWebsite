import js from "@eslint/js"
import globals from "globals"
import prettier from "eslint-config-prettier"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      ".cache/**",
      ".tools/**",
      "dist/**",
      "node_modules/**",
      "public/**",
      "test-results/**",
      "playwright-report/**",
      "blender/previews/**"
    ]
  },
  js.configs.recommended,
  {
    // The build and asset scripts run in Node.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  // Last, so formatting is Prettier's job and no stylistic rule can disagree with it.
  prettier
)
