---

## 2A. Live run against a real environment

The audit above was written without a running application. It has since been **executed** against a disposable Supabase project the owner confirmed as throwaway, with a `next dev` server, Razorpay test-mode keys and a locally-signed webhook secret. This section records what actually happened.

### 2A.1 What the environment turned out to have

| | |
| --- | --- |
| Supabase | Reachable; service-role key valid. **18 profiles, 30 appointments, 21 payments, 43 care plans** before Step 0 |
| Razorpay | `NEXT_PUBLIC_RAZORPAY_KEY_ID` = `rzp_test_…` — **test mode confirmed**. Both the browser and `create-order` read that same key |
| Webhook | `RAZORPAY_WEBHOOK_SECRET` was unset. Set locally to a known value so webhook deliveries could be signed and replayed |
| Google Calendar | Credentials present but not exercised |
| **`SUPABASE_ACCESS_TOKEN`** | **Absent — and this is the one consequential gap.** `scripts/run-schema.mjs` applies the schema over the Management API and needs a Personal Access Token, which is neither the service-role key nor the database password |

**So the schema fixes in this branch are not in that database.** `site_settings.auto_assign_therapist_enabled` does not exist there, which means the auto-assign feature reads its setting, fails closed, and stays off — the designed behaviour for an unmigrated database, and confirmation that the fail-closed default is the right one. It also means the database still holds the **old** `debug_reset_all_data`, which turned out to be useful.

### 2A.2 F-01, confirmed by running it

The reset was executed through the real route, with the old function still in the database. Row counts either side:

| Table | Before | After | Outcome |
| --- | --- | --- | --- |
| `care_plans` | 43 | 0 | Cleared, by CASCADE — as the static analysis predicted |
| `care_plan_versions` | 45 | 0 | Cleared, by CASCADE |
| `appointments` | 30 | 0 | Cleared |
| `payments` | 21 | 0 | Cleared |
| `pain_assessments` | 12 | 0 | Cleared |
| `treatment_categories` | 7 | 0 | Cleared |
| **`risk_signals`** | **1** | **1** | **SURVIVED A "DELETE EVERYTHING" RESET** |

`communication_flags`, `contact_reveal_log` and `risk_reviews` were already empty, so they are inconclusive by measurement — but `risk_signals` is decisive, and the CASCADE reasoning that explains why the other three behave as they do was confirmed correct by `care_plans` and `care_plan_versions` clearing exactly as predicted.

**F-01 is no longer an inference. It is a measurement.** The fix in this branch is what stops it, and it takes effect when the schema is applied.

The four gates were exercised at the same time:

| Gate | Result |
| --- | --- |
| No session at all | **403 Forbidden** |
| Wrong confirmation phrase (`reset all data`) | **400** `Type RESET ALL DATA exactly to confirm.` |
| Correct phrase, full admin, armed | **200** `{"success":true,"adminsKept":4,"accountsDeleted":14}` |
| Admins survive | **4 admins**, confirmed by query afterwards |

### 2A.3 The automated suite

Every spec file was run except two, in batches. **230 distinct test cases executed.**

| Batch | Specs | Result |
| --- | --- | --- |
| 1 | concurrency, booking-rules, admin-money, session-completed-cutoff | **26/26 passed** |
| 2 | admin-authz, admin-validation, admin-exposure, admin-multi-admin, admin-care-plans | 34 passed, **1 failed (real — see F-07)**, 1 skipped |
| 3 | booking-account-role, health-profile, session-suggestions, patient-registration, catalog-detail | 62 passed, 5 failed (**all environment**), 1 skipped |
| 4 | therapist-roster, admin-debug-reset, admin-network, section-nav, splash-screen, journey-pace, therapist-request, admin-dashboard-ui | 71 passed, 3 failed (2 environment, 1 contention) |
| Regression after the F-08 fix | booking-rules, admin-money, health-profile, session-suggestions, consultation-first | **61/61 passed** |

**Not run, and why:**

* `admin-degraded-schema.spec.ts` — it drops columns and tables and restores them by re-applying `schema.sql` in a `finally`. Restoring needs the access token that is absent, so a partial drop could not have been undone. **Deliberately skipped rather than risked.**
* `admin-login.spec.ts` — skips itself unless a second app instance is running against the local Supabase relay.

### 2A.4 The eight failures, classified

Only one was a product defect.

| Test | Classification | Evidence |
| --- | --- | --- |
| `H-006` realtime publication coverage | **REAL — now fixed (F-07)** | See below |
| `BR-001/2/3/5`, `BH-002` (booking-account-role) | **Environment** | The wizards resolve the signed-in role with the *browser's* Supabase client |
| `TR-002` (therapist-request) | **Environment** | Named in `AGENTS.md` as unpassable without browser egress |
| `R-B02` (therapist-roster) | **Environment** | Same cause: Step 1 never renders, so the picker has zero time radios to count |
| `B-003` (admin dashboard Back) | **Contention, not a defect** | Timed out at 2 minutes inside a 15-minute serial run; **passes in 10.9 s when run alone** |

The environment classification was **verified, not assumed**. From inside a page on `/book`, `fetch(SUPABASE_URL + "/rest/v1/")` returns `THREW: Failed to fetch`; the identical call from Node returns HTTP 401 (i.e. reachable). That is exactly the check `AGENTS.md` prescribes, and exactly the documented sandbox limitation.

### 2A.5 Payment integrity, executed

The webhook half of §16.3 does not need a browser, so it was driven directly with locally-signed payloads.

| Test | Result |
| --- | --- |
| `PAY-WH-001a` no signature header | **400** |
| `PAY-WH-001b` wrong signature | **400** |
| `PAY-WH-001c` correct signature over a **re-serialised** body | **400** — the raw-body check works, and is the reason a legitimate webhook must never be "fixed" by relaxing it |
| `PAY-WH-003` a `payment.failed` event | Recorded, `processed_at` stamped, no capture applied |
| `PAY-DUP-004` the same delivery twice, with Razorpay's own `x-razorpay-event-id` | First: `{"processed":true,"applied":true}`. Second: `{"duplicate":true}`. **Exactly one row** in `payment_webhook_events`. Both answered **200**, which is required — an error would have Razorpay retry forever |

The dedup key falls back to `<event type>:<payment id>` when the header is absent, which was also confirmed: two header-less deliveries produced one row keyed `payment.captured:pay_qa_evt_qa_001`.

### 2A.6 Anonymous API refusal, executed

25 routes across every audience were called with no cookie. All refuse, and **no response body leaks a table name, a column name, a row id or a stack trace**. Getting there took a fix — see F-08.
