module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "no-only-tests"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "./packages/config/eslint-preset.js",
  ],
  overrides: [
    {
      // enable the rule specifically for TypeScript files
      files: ["*.ts", "*.tsx"],
      rules: {
        "@typescript-eslint/explicit-module-boundary-types": [0],
        "no-console": ["error", { allow: ["warn", "error"] }],
        "no-only-tests/no-only-tests": ["error", { fix: true }],
      },
    },
  ],
}
