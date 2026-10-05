import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the dependency-free modules in src/lib.
//
// Those modules were written to be testable without rendering or a database
// -- that is why the business maths lives there rather than inside
// components -- and until now nothing tested them. The suite covers the
// arithmetic and the rules that decide money and access: anything needing a
// browser or Supabase belongs in e2e/, which Playwright owns.
//
// scripts/ci/**/*.test.mjs are the pre-merge quality gate's own plumbing
// (target safety, coverage manifest, gate verdict, sanitiser). They are pure
// functions for the same reason: a gate that cannot be tested cannot be trusted.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/ci/**/*.test.mjs"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
