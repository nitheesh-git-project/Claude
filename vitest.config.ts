import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the dependency-free modules in src/lib.
//
// Those modules were written to be testable without rendering or a database
// -- that is why the business maths lives there rather than inside
// components -- and until now nothing tested them. The suite covers the
// arithmetic and the rules that decide money and access: anything needing a
// browser or Supabase belongs in e2e/, which Playwright owns.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
