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
    // Most specs never open a browser, but admin-dashboard-ui.spec.ts does.
    // PLAYWRIGHT_CHROMIUM_PATH lets an environment that already ships a
    // Chromium (a sandbox with no network to fetch one, typically) point at
    // it instead of Playwright downloading its own pinned build.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
            ...(process.env.HTTPS_PROXY
              ? {
                  args: [
                    `--proxy-server=${process.env.HTTPS_PROXY}`,
                    "--proxy-bypass-list=<-loopback>",
                  ],
                }
              : {}),
          },
        }
      : {}),
    // A sandbox that reaches the internet through an egress proxy has to hand
    // that proxy to the browser too: Node picks HTTPS_PROXY up on its own,
    // Chromium does not, and the symptom is every Supabase call from the page
    // failing as a bare "Failed to fetch" while the same call from a spec
    // succeeds. The CA is already in the browser trust store, so this only
    // needs the address -- TLS verification stays on.
    ...(process.env.HTTPS_PROXY
      ? {
          proxy: {
            server: process.env.HTTPS_PROXY,
            // The app under test is local: sending localhost through the
            // egress proxy makes it reject the request as non-CONNECT and
            // the page never loads at all.
            bypass: "localhost,127.0.0.1,::1",
          },
        }
      : {}),
  },
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
