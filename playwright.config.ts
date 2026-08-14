import { defineConfig } from "@playwright/test";

// Scoped to the money-critical paths from the Home Visit QA plan (booking +
// payment, concurrency/CAS guards, bulk-schedule limits) -- not a full UI
// test suite. Every spec talks to the app's HTTP API and Supabase directly
// (Node-level fetch, no browser), so this runs the same way in CI as it
// does locally. Needs a real (test/staging, never production) Supabase
// project + Razorpay test-mode keys in the environment -- see README.md.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
