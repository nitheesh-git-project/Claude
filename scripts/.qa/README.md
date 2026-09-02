# QA harnesses

Small scripts used to execute parts of `docs/qa/`'s manual test plan against a
real environment, for the checks the Playwright suite does not cover. They talk
to the app over HTTP and to Supabase with the service-role key, so **point them
at a disposable project only**.

Run them from the repository root, so `node_modules` resolves.

| Script | What it does |
| --- | --- |
| `mkadmin.mjs` | Creates (or re-passwords) `qa.admin@example.test` as a full-scope admin, so the plan's admin fixtures exist without editing the database by hand. |
| `step0.mjs` | Executes STEP 0 — counts the tables either side of the reset, exercises all four gates, and reports which tables survived. This is what turned F-01 from an inference into a measurement. |
| `webhook-sec.mjs` | The webhook half of §16.3 (signature, raw-body, duplicate delivery, non-capture events) plus the §18.2 anonymous-caller sweep over 25 routes. |
| `dedup.mjs` | Webhook deduplication on Razorpay's own `x-razorpay-event-id` header, asserting exactly one stored row for two deliveries. |
| `authorder.mjs` | Calls the routes that once validated a body before checking authentication, with well-formed bodies, and asserts 401/403. The regression guard for F-08. |
| `hv.mjs` | The same, pushed further for the two home-visit order routes. |
| `egress-check.mjs` | Compares browser→Supabase against Node→Supabase. Run this **before** filing a defect against any browser spec: "Failed to fetch" from the page with the same call succeeding from Node is the sandbox's network policy, not the product. |
| `supabase-relay.mjs` | Pre-existing: a localhost passthrough to Supabase, so `admin-login.spec.ts` can test the real login form. |

`step0.mjs` deletes data. Read it before running it.
