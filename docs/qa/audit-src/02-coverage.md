---

## 3. Area-by-area audit

Each row names the plan section, the rule under audit, the evidence class, and where the mechanism was found.

### 3.1 Authentication, roles and gates (plan §4, §18)

| Rule the plan asserts | Class | Evidence |
| --- | --- | --- |
| Gates enforced in **two** places — proxy for navigation, `requireActiveProfile` in routes | VERIFIED-SOURCE | `src/proxy.ts` matcher covers all four dashboard trees; `src/lib/supabase/proxy.ts` redirects per role; self-service routes call `isProfileActive` |
| A signed-in wrong-role user is sent to `/get-started`, never `/admin/login` | VERIFIED-SOURCE | `supabase/proxy.ts` admin branch redirects to `/get-started` |
| One account, one role — a therapist cannot book | VERIFIED-SOURCE | `isPatientProfile` present in **exactly** the 5 routes the plan names: `appointments/create`, `razorpay/create-order`, `home-visit/create-order`, `home-visit/book-cash`, `care-plan/create-order` |
| A payment **attempt** auto-approves a patient; home visits and standalone registration do not | VERIFIED-SOURCE | `approvePatientForGenuinePaymentAttempt` called in `razorpay/create-order` only |
| `/api/appointments/create` gates on active, not approved | VERIFIED-SOURCE | Route uses `isProfileActive`, with the reasoning in its own header comment |
| Every admin route guards with `requireAdminScope(section)` | **VERIFIED-SOURCE — with a correction** | **92 of 95** admin routes call `requireAdminScope`. Three use `getAdminContext` plus a **stricter** explicit check. See F-04 |
| Only `full` may change scopes; nobody changes their own; the last `full` cannot be narrowed | VERIFIED-SOURCE | `set-admin-scope/route.ts` — all three guards present |
| A generated password never reaches the audit log's `details` | VERIFIED-SOURCE | No password variable is passed into `recordAdminActivity` in any create/reset route |
| Suspension is enforced against a live cookie | NOT-VERIFIABLE | Mechanism present; behaviour needs a session |

### 3.2 Booking and the wizard (plan §10, §11.2–11.3)

| Rule | Class | Evidence |
| --- | --- | --- |
| Picker and server validator read the **same** lead-time setting | VERIFIED-SOURCE | `bookingSlots.ts` exports the rule; `appointments/create` calls `leadTimeMsFromHours(settings.onlineBookingLeadTimeHours)` |
| Concern, duration, price and therapist preference re-derived server-side | VERIFIED-SOURCE | `appointments/create` reads `treatment_categories` and refuses an inactive one; the browser's values are not trusted |
| The browser never inserts an appointment | VERIFIED-SOURCE | No `from("appointments").insert` in any client component; the RLS insert grant is dropped at the end of `schema.sql` |
| A stale `?package=` link is answered, not ignored | VERIFIED-SOURCE | `BookingWizard.tsx` renders the "Programmes come from your therapist now" branch, ordered after the wrong-account branch |
| Patient self-overlap refused client **and** server side | VERIFIED-SOURCE | Both checks present; the server one uses the admin client so RLS cannot hide a clashing row |
| The roster does **not** filter the picker | VERIFIED-SOURCE | `bookingSlots.ts` applies the lead-time rule alone; no availability import anywhere in the wizard |
| Lead-time boundary maths (TIME-A/B/C scenarios) | NOT-VERIFIABLE | Pure function is unit-tested via `availabilityRanges`; the *calendar rendering* of it is not |
| Every validation message quoted in `PAT-BOOK-011` | VERIFIED-SOURCE | All eight strings found verbatim in `BookingWizard.tsx` |

### 3.3 Payments (plan §9, §16.3)

| Rule | Class | Evidence |
| --- | --- | --- |
| One capture path, idempotent by construction | VERIFIED-SOURCE | `record_payment_capture` in `schema.sql`, called by the three verify routes and the webhook |
| `payments` unique on order id **and** payment id | VERIFIED-SOURCE | `payments_razorpay_order_id_key` and `payments_razorpay_payment_id_key`, `schema.sql:4505,4507` |
| Webhook signature checked against the **raw** body | VERIFIED-SOURCE | `await request.text()` before HMAC; no parse/re-serialise |
| The dedupe is the `payment_webhook_events` insert, **before** any work | VERIFIED-SOURCE | Insert precedes processing; `23505` collision short-circuits |
| Without the secret the webhook is a 503 | VERIFIED-SOURCE | Route returns `{"error":"Webhook not configured"}`, 503 |
| A prior paid order is claimed rather than re-minted | VERIFIED-SOURCE | `create-order` fetches the prior order and claims the appointment when Razorpay reports it paid |
| Amounts re-derived server-side | VERIFIED-SOURCE | Category row read server-side; care-plan price re-read from the recommended package |
| Duplicate webhook / callback race / 12-way concurrency | NOT-VERIFIABLE | The locking mechanism is present (`select … for update` in the RPC); a race needs a live database |

### 3.4 Session credits and the ledger (plan §11.8, §16)

| Rule | Class | Evidence |
| --- | --- | --- |
| An overdrawn balance is impossible, not merely unwritten | VERIFIED-SOURCE | `check (sessions_used >= 0 and sessions_used <= session_count)` and the `visits_used` twin, `schema.sql:4385,4403` |
| Ledger is append-only **by trigger**, not RLS | VERIFIED-SOURCE | `trg_session_credit_ledger_append_only`, `schema.sql:5235` |
| Idempotency keys derived, never random | VERIFIED-SOURCE | `reserve:<appointment_id>` / `consume:<appointment_id>` in `sessionCredits.ts` |
| `sessions_granted` and `package_snapshot` frozen | VERIFIED-SOURCE | Freeze trigger present |
| The ledger-authority switch reaches every balance surface through one helper | VERIFIED-SOURCE | `ledgerBalances.ts` imported by 8 call sites covering all six surfaces the plan names |
| The switch does **not** change how a session is claimed | VERIFIED-SOURCE | Counter CAS untouched by the helper |

### 3.5 Care plans and recommendations (plan §12.5, §14.2)

| Rule | Class | Evidence |
| --- | --- | --- |
| No price / session-count / discount column exists on a version | VERIFIED-SOURCE | `care_plan_versions` carries none; the four clinical fields only |
| `source_appointment_id` NOT NULL and re-derived | VERIFIED-SOURCE | Column and route both confirmed |
| Versions append-only by trigger; only `is_current` may change | VERIFIED-SOURCE | `trg_care_plan_versions_append_only`, `schema.sql:6224`, with three distinct raise messages |
| At most one live plan per patient | VERIFIED-SOURCE | `care_plans_one_active_per_patient`, `schema.sql:6130` |
| Both doors call one authoring implementation | VERIFIED-SOURCE | `authorCarePlanVersion()` called by the therapist route and `admin/author-care-plan` |
| Split attribution (`authored_by` / `entered_by`) | VERIFIED-SOURCE | Both columns written on the admin path |
| A purchased plan cannot be withdrawn | VERIFIED-SOURCE | CAS on `status = 'active'` in `withdraw-care-plan` |
| Unit-tested rules | **EXECUTED** | `carePlans.test.ts` — 20 tests pass |

### 3.6 Suggested sessions (plan §11.8, §12.5)

| Rule | Class | Evidence |
| --- | --- | --- |
| A suggestion is its own row, never an appointment | VERIFIED-SOURCE | `session_suggestions` table; only acceptance calls `bookPackageSession()` |
| At most one pending per purchase, by index not by route check | VERIFIED-SOURCE | `session_suggestions_one_pending_per_purchase`, `schema.sql:3984` |
| Nothing writes an "expired" status | VERIFIED-SOURCE | `suggestionState()` computes lapse at read time |
| Gated by a setting, **off by default** | VERIFIED-SOURCE | `therapist_suggestions_enabled … default false`, `schema.sql:4011` |
| Button-spam and dropped-connection behaviour | NOT-VERIFIABLE | Synchronous ref present in the component; behaviour needs a browser |

### 3.7 Roster and availability (plan §12.2, §14.2)

| Rule | Class | Evidence |
| --- | --- | --- |
| Periods convert to the same hour rows | **EXECUTED** | `availabilityRanges.test.ts` — 41 tests pass |
| Server-side validation shared by both save doors | **EXECUTED** | `availabilityRequest.test.ts` — 16 tests pass |
| Weekly save is a CAS under a row lock, versioned | VERIFIED-SOURCE | `save_therapist_weekly_schedule` + `therapist_schedule_state` |
| A date exception replaces its whole day in one function | VERIFIED-SOURCE | `set_therapist_date_exception` |
| A therapist reads exceptions, an admin writes them | VERIFIED-SOURCE | Write route is under `api/admin/`, scope-guarded |
| Leave never clears the schedule | VERIFIED-SOURCE | `profiles.on_leave` is a separate flag; no schedule mutation in the leave path |
| Availability never touches an appointment | VERIFIED-SOURCE | No appointment write in any availability route |

### 3.8 Clinical layer (plan §11.7, §12.4)

| Rule | Class | Evidence |
| --- | --- | --- |
| Question keys globally unique across the three sets | VERIFIED-SOURCE | Module-load assertion in `conditionIntake.ts` throws if violated |
| Applying an approved change **merges** | VERIFIED-SOURCE | `mergeSpecialtyAnswers()` present and used on the approve path |
| `schema_version` is per specialty | VERIFIED-SOURCE | `INTAKE_QUESTIONS_VERSION_BY_SPECIALTY` |
| Pain Map is orthopaedic; non-ortho pages never query it | VERIFIED-SOURCE | Two-phase read; both submit routes 400 for non-ortho |
| The patient's lock is enforced in `submit`, `save-draft` **and** an insert policy | VERIFIED-SOURCE | All three present |
| Session notes have no patient select policy | VERIFIED-SOURCE | No such policy in `schema.sql`; export excludes the table |
| Documents: private bucket, 120-second signed URL, 10 MB / 20 files | VERIFIED-SOURCE | `medicalDocuments.ts` constants; view route mints a short-lived URL |
| `pain_assessments` append-only | **PARTIAL — see F-03** | Enforced by `revoke update, delete from authenticated` only; no trigger, unlike its five siblings |

### 3.9 Contact controls (plan §12.6)

| Rule | Class | Evidence |
| --- | --- | --- |
| Two tiers; clinical text with digits does not fire | **EXECUTED** | `contactLeakScan.test.ts` — 33 tests pass |
| Masking keeps prefix and last three digits | **EXECUTED** | `contactMasking.test.ts` — 13 tests pass |
| Reveal allowed in the join window, or any time on a home visit's own day | VERIFIED-SOURCE | `canRevealContact()` branches on `visitMode === "home_visit"` |
| A reveal that cannot be logged is refused | VERIFIED-SOURCE | `reveal-contact` returns 500 when the log insert fails — not best-effort |
| Both evidence tables append-only by trigger | VERIFIED-SOURCE | `communication_flags_no_change`, `contact_reveal_log_no_change`, `schema.sql:6435,6441` |
| `contact_scan_mode` fails open; `contact_masking_enabled` fails closed | VERIFIED-SOURCE | Each read in its own call with the documented fallback |

### 3.10 Money (plan §16)

| Rule | Class | Evidence |
| --- | --- | --- |
| `net = gross − refunds` | VERIFIED-SOURCE | `moneyByBucketFor` computes net as exactly that |
| `clinic = splittable − therapist − partner` | VERIFIED-SOURCE | Computed as that difference — the identity holds **by construction**, so it cannot drift |
| Therapist share only on **completed and paid** | VERIFIED-SOURCE | `if (a.status === "completed")` guards the cut |
| Travel fee inside the therapist cut, never in revenue | VERIFIED-SOURCE | Added to the cut, never to gross |
| Refunds reverse the partner cut, not the therapist's | VERIFIED-SOURCE | Hospital cut taken on `netPaise`; therapist cut on `paidPaise` for completed only |
| Unknowable split excluded and **named**, never guessed | VERIFIED-SOURCE | `excludedCount` / `excludedRevenuePaise`; the "referred but unconfigured" case is distinguished from "not referred" |
| Gateway fee on gross, skipped for cash | VERIFIED-SOURCE | `gatewayFeePaise` skips `payment_method === "cash"` and uses `amount_paid_paise` |
| Home-visit price and payout maths | **EXECUTED** | `homeVisitPricing.test.ts` — 11 tests pass |
| **`moneyByBucketFor` itself** | **NOT TESTED AT ALL** | See F-06 |

### 3.11 Admin surface

| Rule | Class | Evidence |
| --- | --- | --- |
| Six sections, 28 screens, one definition | VERIFIED-SOURCE | `adminNav.ts` and the page's `screens` map agree; all 28 keys present in both |
| Every `AdminActivityAction` has a caller | **VERIFIED-SOURCE — clean** | All **46** actions traced to at least one calling route. `payout.settle` included |
| Audit log has a select policy and no insert policy | VERIFIED-SOURCE | `admin_activity_log_select_admin` only |
| Every dashboard page selects the shared settings column list | VERIFIED-SOURCE | All seven dashboard pages plus the three role loaders use `SITE_SETTINGS_SELECT` |
| The Session Completed cutoff reaches every role | VERIFIED-SOURCE | `completedAfterMinutes` passed by all four shells **and** both admin detail contents — 8 call sites |
| All Sessions row cap | **PLAN WAS WRONG — corrected** | No cap; `usePagedList` with `DEFAULT_PAGE_SIZE = 10`. See F-05 |
