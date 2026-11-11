import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Claude Code skill tooling, not application source: plain
    // CommonJS scripts that legitimately use require(), which the Next
    // TypeScript preset flags. Linting them under the app's rules only
    // produced a permanently red `npm run lint`, which is the command this
    // repo relies on to verify a change.
    ".claude/**",
  ]),
  {
    // docs/rules/testing.md: a bare networkidle wait hung the gate for whole
    // test timeouts with no request open. Use settleNetwork() from
    // e2e/helpers.ts, or pass a timeout and handle the rejection yourself.
    files: ["e2e/**/*.ts"],
    ignores: ["e2e/helpers.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='waitForLoadState'][arguments.length=1][arguments.0.value='networkidle']",
          message:
            "Bare networkidle waits hang on the CI stack. Use settleNetwork(page) from ./helpers (docs/rules/testing.md).",
        },
        {
          selector:
            "CallExpression[callee.property.name='goto'] > ObjectExpression > Property[key.name='waitUntil'][value.value='networkidle']",
          message:
            "goto({ waitUntil: 'networkidle' }) hangs the same way. Go to the page, then call settleNetwork(page).",
        },
      ],
    },
  },
]);

export default eslintConfig;
