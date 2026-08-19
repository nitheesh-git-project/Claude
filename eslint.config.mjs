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
]);

export default eslintConfig;
