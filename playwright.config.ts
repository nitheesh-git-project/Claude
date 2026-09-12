import { defineConfig } from "@playwright/test";

// The suite runs in the clinic's zone, and this line is load-bearing.
//
// Specs build a bookable slot with `d.setHours(hour, 0, 0, 0)`, which is a
// whole hour in whatever zone the *runtime* happens to be in. The app judges
// the whole-hour rule in the **booking's own** zone -- never the server's,
// deliberately, because India is UTC+05:30 and reading the minute off the
// instant would refuse every correct booking in the clinic while passing one
// half an hour out (see `isWholeHourSlot` and the booking rule in AGENTS.md).
//
// So on a developer's machine, set to India time, those specs pass; on a UTC
// host the same slots arrive as 15:30 IST and the route correctly answers
// "Sessions start on the hour." Twenty cases across session-scheduling,
// session-suggestions, booking-rules and concurrency went red that way, all
// of them describing a working product.
//
// Set here rather than left to the person running it: an environment
// variable somebody has to remember is one they will forget, and the failure
// it produces reads as a broken booking funnel rather than as a clock. It is
// assigned before any spec is loaded, which is what makes `new Date()` in a
// spec honour it.
process.env.TZ = "Asia/Kolkata";

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
  // The dashboards have loading boundaries, so a navigation now resolves on
  // the skeleton and the real content arrives once the server work finishes
  // — roughly seventy queries on the admin dashboard. Playwright's 5s
  // default for a web-first assertion was written for a page that blocks
  // until it is ready, and races that. Raising it here rather than at each
  // call site, since it applies to every browser assertion in the suite.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // One worker. Every spec talks to the same Supabase project and the same
  // app instance, so parallel files contend: they read each other's rows out
  // of shared tables, and two browser suites at once pushed the admin
  // dashboard (roughly seventy queries) past even a generous assertion
  // timeout. A correctness gate that fails on scheduling is worse than a
  // slower one — this roughly doubles the runtime and makes it deterministic.
  workers: 1,
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
