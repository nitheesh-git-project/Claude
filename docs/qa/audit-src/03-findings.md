---

## 4. Findings

Thirteen findings across two passes. Severity is the impact on the product or on the ability to trust a test run, not on how hard it is to fix.

**All thirteen are fixed.** Each entry keeps the finding as written and ends with what was changed. Pass 1 took the unit suite from **153 tests in 9 files to 187 in 11**; the branch now stands at **384 in 23**, and `npm run verify` (lint + tests + build) is green.

### 4.0 Pass-2 regression check on the pass-1 findings

Every fix from 2 September was re-checked against the current head. **All eight hold**, and the two that could regress silently were re-checked by sweep rather than by eye.

| # | Fix | Still in place? | How it was re-checked |
| --- | --- | --- | --- |
| F-01 | Reset clears the care-plan, evidence and risk tables | **Yes** | The `TRUNCATE` list at the last `debug_reset_all_data` names 50 tables; a sweep of every `create table` in the file found **no table created after that definition missing from the list**. `risk_rules` is still reset-to-defaults rather than emptied |
| F-02 | `risk_reviews.reviewer_id` nullable | **Yes** | `alter table risk_reviews alter column reviewer_id drop not null` present — **but the same mistake reappeared in a newer table.** See F-09 |
| F-03 | `pain_assessments` append-only by trigger | **Yes** | `pain_assessments_no_change` still attached `before update or delete` |
| F-04 | Plan corrected on the scope guard | **Yes, but the numbers moved** | 99 of 102 now, not 92 of 95; corrected in this issue and in the plan |
| F-05 | Plan corrected on the All Sessions row cap | **Yes** | The plan describes `ListPager`, not a cap |
| F-06 | `adminMetrics.test.ts` | **Yes** | 24 tests, re-run this pass and passing |
| F-07 | `therapist_schedule_state` subscribed and published | **Yes** | `check:realtime` passes: 40 subscribed tables, all published |
| F-08 | Auth hoisted above body validation | **Only in the eleven routes the probe hit.** See F-10 | A static sweep of all 160 handlers found **28** still parsing before authenticating |

The last row is the finding worth reading twice: a fix applied to the instances a probe happened to reach, rather than to the class, leaves the rule looking enforced.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F-01 | The reset misses four tables | P1 | **Fixed** — all named in the TRUNCATE list; `risk_rules` reset to seeded defaults |
| F-02 | `risk_reviews.reviewer_id` NOT NULL + ON DELETE SET NULL | P2 | **Fixed** — column made nullable |
| F-03 | `pain_assessments` append-only by revoke alone | P3 | **Fixed** — trigger attached |
| F-04 | Plan overstated the admin scope guard | P3 | **Fixed** — plan corrected |
| F-05 | Plan asserted a removed row cap | P3 | **Fixed** — plan corrected |
| F-06 | The revenue split had no unit test | P1 (risk) | **Fixed** — `adminMetrics.test.ts`, 24 tests |
| F-07 | A table the dashboard reads was never subscribed or published | P2 | **Fixed** — found by the repo's own test during the live run |
| F-08 | 11 routes validated the body before checking authentication | P3 | **Fixed** — auth hoisted above validation |
| F-09 | `care_plan_reviews.reviewer_id` repeats the F-02 contradiction | P3 | **Fixed** — column made nullable |
| F-10 | F-08 was fixed in 11 routes, not in the class; 28 still parsed before authenticating | P3 | **Fixed** — hoisted in all 28, sweep now returns 0 |
| F-11 | 24 mutating admin routes wrote no audit row at all | P2 | **Fixed** — 23 new actions, one per route, sweep now returns 0 |
| F-12 | The test plan referenced five test IDs that were never written, quoted one error string that had changed, and miscounted the admin screens | P2 | **Fixed** — cases written, quotes and counts corrected |
| F-13 | The therapist Overview's primary quick action was a dead anchor | P2 | **Fixed** — points at the route |

---

### F-01 — The data reset does not clear four tables, and one of them silently suppresses future test results · **P1**

**Area.** Plan §6 (STEP 0), `SETUP-RESET-001`. **Class.** VERIFIED-SOURCE, with schema line numbers.

**What the product promises.** The reset button's own copy reads: *"Deletes **everything** — people, sessions, purchases, catalog, settings. Admin logins survive. No undo."* `AGENTS.md` states the rule explicitly: *"Adding a table means adding it to that TRUNCATE list, or a reset silently leaves its rows behind."*

**What actually happens.** The last definition of `debug_reset_all_data` is at `schema.sql:4876`. These tables were added **after** it and were never added to its `TRUNCATE` list:

| Table | Created at | Cleared by the reset? | Why |
| --- | --- | --- | --- |
| `care_plans` | 6092 | **Yes** — by CASCADE | References `session_entitlements` and `treatment_categories`, both truncated |
| `care_plan_versions` | 6136 | **Yes** — by CASCADE | References `appointments`, `session_notes`, both truncated |
| `contact_reveal_log` | 6395 | **Yes** — by CASCADE | References `appointments` |
| **`communication_flags`** | 6344 | **NO** | Its only FKs are to `profiles`, and they are `on delete set null` — so neither the TRUNCATE nor the `delete from auth.users` reaches it |
| **`risk_rules`** | 6478 | **NO** | No foreign keys at all |
| **`risk_signals`** | 6498 | **NO** | Only FK is to `risk_rules`, which is not truncated. `subject_id` is a plain `uuid` with no FK |
| **`risk_reviews`** | 6539 | **NO** | FKs to `profiles` and `risk_signals`, neither truncated |

Note that `therapist_schedule_state` **is** in the list despite also being added later, so the list has been maintained for the roster work — the care-plan, evidence and risk tables were simply missed.

**Why this is P1 rather than cosmetic.** Three consequences, in increasing order of seriousness:

1. **The button lies.** "Deletes everything" is false for four tables.
2. **Orphaned evidence.** `communication_flags` rows survive with `author_id` and `patient_id` set to null by the cascade, so the flag remains but the people it names are gone. The table has a `BEFORE UPDATE OR DELETE` trigger that raises, so **there is no way to clear these rows short of adding the table to the TRUNCATE list** — a row delete is refused by design.
3. **The next test run is silently corrupted.** `risk_signals` carries a partial unique index giving at most one **open or reviewing** signal per `(rule, subject)`. A leftover open signal from a previous run holds that slot, so the same rule firing again on the same subject **writes nothing**. A tester executing `ADM-RISK-001` on a "clean" database sees an empty queue and reports a broken detector. This is exactly the leftover-state trap the plan warns about in §6.1 — except the plan tells the tester the reset protects them from it.

**Fix.** Add `communication_flags`, `risk_signals` and `risk_reviews` to the `TRUNCATE` list in a new `create or replace` of the function at the end of `schema.sql` (the file's own append-only convention). Decide `risk_rules` deliberately: it is configuration, so either truncate it and let the seed re-insert the eight rules, or reset it to defaults the way `site_settings` is — but do not leave it in its current state, where an edited threshold survives a wipe with nothing telling anyone.

**Retest.** `SETUP-RESET-001`, plus a new assertion: after a reset, `select count(*) from communication_flags` and `from risk_signals` both return `0`.

**FIXED.** `debug_reset_all_data` is redefined at the end of `schema.sql` (the file's append-only convention — later definitions win). `communication_flags`, `risk_signals` and `risk_reviews` are now named in the `TRUNCATE`, and `care_plans` / `care_plan_versions` / `contact_reveal_log` are named explicitly too rather than relying on CASCADE, so a future foreign-key change cannot quietly take them back out of the reset. `risk_rules` is deliberately **not** truncated — it is configuration, like `site_settings` — and is instead reset to its seeded defaults, because an empty `risk_rules` would silently disable every detector rather than restoring it. `SETUP-RESET-001` now asserts both counts and the restored thresholds.

---

### F-02 — `risk_reviews.reviewer_id` is `NOT NULL` with `ON DELETE SET NULL` · **P2**

**Area.** Plan §14.1, `ADM-RISK-002`. **Class.** VERIFIED-SOURCE.

**Evidence.** `schema.sql:6542`:

```
reviewer_id uuid not null references profiles(id) on delete set null,
```

These two clauses contradict each other. When the referenced profile is deleted, Postgres attempts to set `reviewer_id` to null, which the `NOT NULL` constraint refuses — so **the delete raises** rather than the reference being cleared. A scan of the whole schema found this is the **only** occurrence of the pattern; every other `on delete set null` column is nullable.

**Reachability.** Reviews are written by admins, and the reset preserves admins, so the standard reset path does not hit it. It becomes reachable when an admin account is deleted at all, and specifically when an admin who has reviewed a risk signal is demoted to another role and a reset then runs: the `delete from auth.users` cascades to `profiles`, the SET NULL fires, the constraint refuses, and **the entire reset transaction aborts** — leaving a half-tested database and an error a tester will not be able to interpret.

**Fix.** Pick the intent and state it. Either `reviewer_id` is nullable (a review outlives its reviewer, which matches how the other evidence tables treat authorship), or the reference is `ON DELETE RESTRICT` and a reviewer cannot be deleted while reviews exist. The current pair is neither, and produces a failure mode nobody chose.

**FIXED.** `alter table risk_reviews alter column reviewer_id drop not null`. A review outliving its reviewer is the intended reading — the same posture `communication_flags` already takes with `author_id`, whose reference is nullable for exactly this reason. The reviewer's name is resolved at render time, as it already is for a flag whose author has gone.

---

### F-03 — `pain_assessments` is append-only by RLS alone, unlike its five siblings · **P3**

**Area.** Plan §12.4, `THR-HP-005`. **Class.** VERIFIED-SOURCE.

**Evidence.** `pain_assessments` is protected by `revoke update, delete on pain_assessments from authenticated` (`schema.sql:2212`). Five comparable tables use a **trigger** instead: `session_credit_ledger`, `care_plan_versions`, `communication_flags`, `contact_reveal_log`, `risk_reviews`.

**Why the difference matters.** The codebase already articulates the reason, in its own comment beside the ledger: *"The revoke covers a browser session; every route in this app writes with the service-role client, which bypasses RLS entirely. For a table whose whole value is that it cannot be rewritten, 'no route updates it' is not the same guarantee as 'an update raises'."* Pain Map data is clinical exam history whose value is precisely that a re-assessment is a new row, so a trend can be shown against the previous visit. It is protected one grade below the tables that share that property.

**Severity is P3, not higher,** because no route today updates it, and the gap is a consistency and defence-in-depth issue rather than a live hole.

**Fix.** Reuse the existing `communication_evidence_is_append_only()` trigger function — it already raises with the table's own name — and attach it to `pain_assessments`.

**FIXED.** `pain_assessments_no_change`, a `before update or delete` trigger using that same function. The table now carries the same guarantee as its five siblings.

---

### F-04 — The plan overstates the admin scope guard (documentation defect) · **P3**

**Area.** Plan §4.4, §15.3, `ADM-SET-027`. **Class.** VERIFIED-SOURCE.

**What the plan says.** *"**Every** admin route guards with `requireAdminScope(section)`, not `getAdminUser()`."*

**What is true.** **92 of 95** admin routes call `requireAdminScope`. Three do not, and all three are deliberate and **stricter**:

| Route | Guard | Why stricter |
| --- | --- | --- |
| `admin/set-admin-scope` | `getAdminContext` + `scope !== "full"` → 403 | A section check would let a `finance` admin widen its own access |
| `admin/debug-reset` | `getAdminContext` + `scope !== "full"` → 403 | Gate 3 of the reset |
| `admin/create-account` | `getAdminContext` + full-only for minting an admin, full-or-operations otherwise | A scoped admin creating a full admin would hand itself the keys |

**Impact.** No security impact — the exceptions are tighter than the rule. The defect is in the test plan: a tester reading §4.4 literally would file these three as violations. Correct the plan to state the rule as "every admin route guards on scope; three guard on `full` explicitly, because a section check would be too weak."

**Fix applied in this session:** the wording is corrected in the plan sources.

---

### F-05 — The plan asserted a row cap on All Sessions that no longer exists (documentation defect) · **P3** · **Fixed**

**Area.** Plan §14.2, `ADM-SESS-001`. **Class.** VERIFIED-SOURCE.

The plan asserted *"at most 200 rows are painted before a 'Show all' affordance appears"*. That was the **previous** design. The screen now uses the shared pager: `usePagedList(rows, { storageKey: "admin-sessions" })` with `DEFAULT_PAGE_SIZE = 10`. `AGENTS.md` records the change explicitly — *"Don't cap a list at an arbitrary number with a 'Show all' escape hatch: that was what All Sessions did, and 'Show all' then painted every row anyway."*

A tester would have reported a working screen as a defect. **Corrected in this session**; the test now asserts the pager, the per-browser page-size memory, and that exports and totals still run over the whole filtered set.

---

### F-06 — The revenue split has no unit test · **P1 (risk, not a defect)**

**Area.** Plan §16. **Class.** EXECUTED (by absence) + VERIFIED-SOURCE.

`moneyByBucketFor` in `src/lib/adminMetrics.ts` is the only place the clinic's money is divided, and the plan's two identities live inside it. It feeds the Money summary strip, the tiles and the breakdown chart, so a defect there is wrong on three screens at once and wrong in the same direction, which makes it invisible to cross-checking between them.

**There is no `adminMetrics.test.ts`.** The nine test files cover the roster, home-visit pricing, the scanner, masking, settings, risk vocabulary, care plans and the consultation rule — every dependency-free module in `src/lib` **except** the one that computes the split. Its own comments record **four** distinct historical misstatements it has already been corrected for: counting uncompleted sessions in the therapist cut, dropping the travel fee into the clinic's share, subtracting refunds from a margin that had already had a cut taken, and collapsing "no hospital" with "hospital share unconfigured". Every one of those is exactly the kind of arithmetic a table-driven unit test pins down permanently.

This is not a defect — the current implementation reads correctly, and the identities hold by construction because the clinic share is computed as the difference rather than accumulated independently. It is the **largest untested risk surface in the application**, and it is the one the finance section of the test plan spends the most manual effort re-deriving by hand.

**FIXED.** `src/lib/adminMetrics.test.ts` — **24 tests**, structured around the four historical misstatements rather than around the function, so the point is that they stay fixed:

* both identities asserted, including on an empty range;
* a completed paid session earns a cut, a paid-but-undelivered one does not, and a cancelled-and-refunded one earns nothing while still counting in gross;
* a home visit's travel fee lands in the cut and never in gross, falls back to the online share when no home-visit rate is set, and treats a negative fee as zero rather than as a credit;
* the partner's commission is taken on net, so a refund reverses it, while the therapist's is untouched;
* "not referred" and "referred but unconfigured" stay apart — same money, opposite treatment;
* unpaid, slot-less and out-of-range sessions are ignored, and bucketing is by slot time rather than by when the money was taken;
* and the whole seven-row §16.1 reference dataset, so the figures a tester re-derives by hand on the Money screens are the figures pinned here.

The operational rates beside it (`computeNoShowRate`, `computeCancellationRate`, `computeRepeatBookingRate`) are covered too — including that they return **percentages, not fractions**, and `null` rather than zero when there is nothing to divide.

**Original recommendation, for the record.** Add `adminMetrics.test.ts` covering the §16.1 reference dataset: a completed paid session, a paid-but-not-completed one, a refunded one, a hospital-referred one, one with an unset therapist share, and a home visit with a travel fee — asserting both identities plus the excluded count. That dataset is already written and hand-computed in the plan; it converts directly into a test table. The manual finance tests then become a check on the *screens*, not on the arithmetic.

---

### F-07 — `therapist_schedule_state` was read by the dashboard but never subscribed or published · **P2** · **Fixed**

**Area.** Plan §14.0 (realtime), `ADM-TODAY-002`. **Class.** EXECUTED — this one was caught by the repository's own test suite during the live run, not by reading code.

**What failed.** `e2e/admin-multi-admin.spec.ts` H-006 asserts that every base table the admin dashboard queries appears in `ADMIN_REALTIME_TABLES`, and that everything in that list is added to the `supabase_realtime` publication. It failed with one name: `therapist_schedule_state`.

**Why the lint check did not catch it.** `scripts/check-realtime-coverage.mjs` and H-006 ask different questions. The script checks that every table the UI **subscribes to** is **published** — it passed, because this table was in neither list. H-006 checks that every table the dashboard **reads** is subscribed to, which is the stricter direction. Two checks, one gap between them.

**Origin.** The table arrived with the roster rebuild (`1aef991`), which added it, queried it from the dashboard at `page.tsx:327`, and updated the reset function's TRUNCATE list for it — but not the realtime arrays. It predates the changes in this branch.

**Consequence, stated honestly.** Benign but real. The dashboard reads `therapist_schedule_state` to hand the roster editor the version its next save must match. Without a subscription, one admin saving a roster leaves a second admin's open dashboard holding a stale version — the compare-and-swap catches it, so nothing is corrupted, but the second admin gets a 409 telling them to reload where a live refresh would simply have happened. It is a papercut, not a correctness hole; it is a finding because the codebase's own stated rule is that a new table goes into one of the two arrays **and** gets its `alter publication` line in the same change.

**FIXED.** Added to `ADMIN_REALTIME_TABLES` (the operational channel — a roster change is operational) and given the guarded `alter publication` block every other publication line in `schema.sql` uses. H-006 re-run: **passes**. `check:realtime` now reports 39 subscribed tables, all published.

---

### F-08 — Eleven routes validated the request body before checking who was asking · **P3** · **Fixed**

**Area.** Plan §18.2, `SEC-ROUTE-002`. **Class.** EXECUTED.

**What was found.** Calling 25 routes with no cookie and an empty body, 11 answered **400 with a field-validation message** rather than 401/403:

```
/api/appointments/cancel               400 {"error":"Missing appointmentId"}
/api/patient/condition-profile/submit  400 {"error":"Missing data"}
/api/razorpay/create-order             400 {"error":"Missing appointmentId"}
…and eight more
```

**How serious, established rather than assumed.** The obvious question is whether authentication was enforced *at all*, so the same 11 were re-called with well-formed bodies. Nine then returned 401/403. The two home-visit order routes validated more deeply first — `{"error":"A street address is required."}` — and only refused once a complete address was supplied. So **authentication was always enforced; nothing could be done anonymously.** No data leaked, no action was possible, and no response contained internals.

That makes this an **ordering** defect, not a hole — which is why it is P3 and not higher. It is still worth fixing on two grounds: an unauthenticated caller should not drive a route's parsing at all, and the other ninety-odd routes in this application already check auth first, so these eleven were the inconsistent ones.

**FIXED.** The `createClient` / `getUser` / `if (!user)` block was hoisted above body validation in all eleven, with a comment at each explaining why the order matters. `npm run verify` is green, and the five spec files covering those routes were re-run afterwards: **61/61 passed**, no regression. Re-running the probe: **11/11 refuse an anonymous caller**, and all 25 routes now refuse with nothing leaked.

---

### F-09 — `care_plan_reviews.reviewer_id` repeats the contradiction F-02 removed · **P3** · **Fixed**

**Area.** Plan §14.2, `ADM-CARE-004`. **Class.** VERIFIED-SOURCE.

**Evidence.** `schema.sql:7309`, in a table written **after** F-02 was fixed:

```
reviewer_id uuid not null references profiles(id) on delete set null,
```

Pass 1 said of the identical line in `risk_reviews`: *"A scan of the whole schema found this is the only occurrence of the pattern."* It was, on 2 September. The care-plan review step then shipped, its table was written from the older one, and the pattern came back — which is the ordinary way a fixed defect returns: not by being undone, but by being copied from something that predates the fix.

**Why it matters.** The two clauses cannot both hold. Deleting the referenced profile makes Postgres attempt a null write the `NOT NULL` refuses, so the **delete raises** and the reference is never cleared. The failure surfaces far from here — as an unrelated account deletion aborting with a message naming a table the person deleting has never heard of.

**Reachability is narrower than F-02's**, which is why this is P3 rather than P2: `care_plan_reviews` **is** in the reset's `TRUNCATE` list and is emptied before `delete from auth.users` runs, so the standard reset path cannot hit it. It needs an admin profile deleted outside a reset — and this product suspends rather than deletes, deliberately, so that is a hand-run statement rather than a screen.

**Fix.** `alter table care_plan_reviews alter column reviewer_id drop not null`, appended at the end of `schema.sql` in the file's own guarded, append-only style, with the reasoning in a comment above it. Nullable is the intended reading, exactly as for `risk_reviews` and `communication_flags.author_id`: a decision outlives the person who made it, the reviewer's name is resolved at render time, and the row itself is still unrewritable because `care_plan_reviews_no_change` refuses every update and delete.

**Retest.** `ADM-CARE-004` is unchanged in behaviour. The storage-layer check is a scratch-database `alter`, then `delete from profiles where id = '<a reviewer>'` — it must not raise.

---

### F-10 — F-08 was fixed in the eleven routes a probe reached, not in the class · **P3** · **Fixed**

**Area.** Plan §18.2, `SEC-ROUTE-002`. **Class.** VERIFIED-SOURCE (pass 1's evidence was EXECUTED; no server was available this pass).

**What was found.** Pass 1 called 25 routes with no cookie, found 11 that answered a body-validation `400` instead of a refusal, and hoisted the auth check above validation in those eleven. A static sweep of **all 160** route handlers this pass — comparing the line at which the body is first parsed against the line of the first authentication call — found **28** routes still parsing first, of which **23** return a `400` before anyone has been identified. Among them: `therapist/set-on-leave`, `therapist/session-notes/submit`, `therapist/pain-assessments/submit`, `patient/medical-documents/delete`, `home-visit/verify` and `care-plan/verify`.

**Severity is unchanged from F-08, and for the same reason.** Authentication was still enforced before anything was written in every one of the 28; nothing could be done anonymously and nothing leaked beyond the shape of the request. It is an ordering defect. What makes it worth its own entry is not the severity but the **shape of the pass-1 fix**: the eleven were the instances the probe happened to reach, and fixing instances rather than the class leaves a rule that looks enforced — the sweep, not the probe, is what says whether it is.

**Fix.** The `createClient` / `getUser` / `if (!user)` block hoisted to the first statement of the handler in all 28, each carrying the same comment pass 1 wrote for the first eleven. `npx tsc --noEmit`, `npm run lint`, 384 unit tests and a full production build are green on the result, and the sweep now returns **0 of 160**.

**Retest.** `SEC-ROUTE-002`, extended: call **every** POST handler with no cookie and an empty body, and assert none answers `400`. That sweep is cheap enough to be the regression test this finding needs.

---

### F-11 — A quarter of the mutating admin routes wrote no audit row, including the one that changes a patient's sign-in email · **P2** · **Fixed**

**Area.** Plan §15.3, `ADM-SET-033`. **Class.** VERIFIED-SOURCE.

**What the codebase promises.** `AGENTS.md` states it without qualification: *"Every mutating admin route records what happened via `recordAdminActivity()` … Adding an action without a caller, or a mutating route without a call, puts the log back where it was."* Pass 1 checked one half of that rule — every declared action has a caller — and found it clean. It did not check the other half.

**What was found.** Of the 102 admin route handlers, three are reads (`export-pdf`, `package-purchase-detail`, `home-visit-purchase-detail`). Of the 99 that write, **24 recorded nothing at all**:

| Route | What it changes with no trace |
| --- | --- |
| `update-patient-contact`, `update-therapist-contact` | The email that **gates sign-in** — the route updates `auth.users` as well as `profiles` |
| `update-patient-notes`, `update-therapist-notes`, `update-therapist-display-content` | Internal notes and public write-ups |
| `set-therapist-team-visibility`, `set-therapist-rating-visibility`, `set-ratings-visible-publicly` | Whether a clinician and the clinic's ratings appear on the public site |
| `clear-session-rating`, `exclude-session-rating` | A rating, and therefore the public average |
| `update-home-visit-address` | **Where a therapist is sent** |
| `condition-access/decide`, `condition-requests/decide`, `condition-requests/direct-edit` | Who may read a patient's record, and what it says |
| `pain-assessments/submit` | A clinical exam, written by an admin |
| `intake-questions/update`, `pain-map-questions/update` | The wording of the clinical instruments themselves |
| `review-risk-signal` | A decision about a colleague |
| `open-meet-access`, `retry-meet-sync` | A session's meeting |
| `update-lead-status`, `update-home-visit-waitlist-status`, `set-referral-capacity-note` | Queue state |
| `debug-reset` | **The whole database** |

Several have a private trail of their own — `condition_change_requests` records its reviewer, `risk_reviews` is append-only — but none of them reaches the one log an admin can read across every screen, which is exactly what "who changed this?" is asked of.

**Why P2.** No money moves through any of these, which is why it is not higher. But the audit log exists because *"a refund, a payout settlement or a cash-remittance confirmation was unattributable the moment more than one person had admin access"* — and by that reasoning, a patient's sign-in email being changed by one of four admins with no record is the same failure in a place that decides whether somebody can get into their own account.

**Fix.** 23 new actions on `AdminActivityAction`, one `recordAdminActivity` call per route, placed after the write and after any compare-and-swap, best-effort as the rule requires. `ADMIN_ACTIVITY_LABELS` is a `Record<AdminActivityAction, string>`, so the compiler refused the change until every new action had a human label — the mechanism the file's own comment describes, working. Two placements are deliberate rather than mechanical: `retry-meet-sync` logs only on the branch that actually created an event, not on the no-op return for an appointment that already had a link; and `debug-reset` logs **after** the wipe, because the wipe truncates `admin_activity_log` and a row written before it would be erased by the action it describes. The sweep now returns **0 of 99**.

**Retest.** `ADM-SET-033`, which gained a step 2a naming ten of the newly-logged actions, and an assertion that a freshly reset database's log holds exactly one row: `Reset all data`.

---

### F-12 — The plan referenced five test cases that were never written · **P2** · **Fixed**

**Area.** The plan itself (§3, §7.4, §24). **Class.** VERIFIED-SOURCE.

**What was found.** Cross-referencing every test ID the plan *cites* against every ID it *defines*: `PAT-DASH-001`, `PAT-DASH-002`, `THR-DASH-001` and `THR-PROF-001` are named as the coverage for four routes in the §3 route map and are defined nowhere, and `PAT-SESS-005` is named in the simulated-clock scenario table. A route map whose rightmost column names a test that does not exist is worse than a blank cell: **it reads as covered**, and the four routes in question are the landing screens every signed-in session starts on.

Three smaller documentation defects came out of the same pass:

* The plan quoted `complete-session`'s refusal as *"You can mark this done once the session's join window has opened."* The route says *"This session hasn't started yet. You can mark it done once it's under way."* A tester matching the quoted string would file a defect against correct behaviour.
* The Settings split and the User Access rename took the admin dashboard to **31** screens. The §3.6 table lists all 31; its heading and both coverage lines in §24 still said 28, and the Offers & Discounts row pointed at `ADM-SET-016`, which is the sign-out banner.
* `SEC-API-*` was cited as a family of API-level security tests. No such family exists; those calls live in `SEC-ROUTE-002`, `SEC-ADMIN-002` and `SEC-TAMPER-*`.

**Fix.** The four missing cases written click-by-click — the patient Overview and booking hub, the therapist Overview and Edit Profile — `PAT-SESS-005` repointed at `PAT-SESS-003`, the error string corrected, the counts and the mapping fixed, and `ADM-PEOP-003` rewritten at step level while its screen was open. The plan now defines **358** cases and every ID it references resolves.

**Retest.** The cross-reference itself: extract every `` `XXX-YYY-NNN` `` the sources cite and every one they define; the difference must be empty but for the four documented `SETUP-*` aliases.

---

### F-13 — The therapist Overview's primary quick action was a dead link · **P2** · **Fixed**

**Area.** Plan §12.1a, `THR-DASH-001`. **Class.** VERIFIED-SOURCE.

**What was found.** Writing the missing `THR-DASH-001` found what it exists to catch. The therapist Overview's first and only `primary` quick action, **Set your availability**, pointed at `/therapist/dashboard#availability` — an anchor from when the dashboard was one long scrolled page. Availability became its own route when the dashboards were split, and `dashboardNavItems.ts` has pointed at `/therapist/dashboard/availability` ever since. The action reloaded Overview and did nothing.

**Why P2 for a one-line fix.** It is the primary call to action on the screen a therapist lands on, for the one task the clinic most needs them to do — an empty roster is why sessions sit unassigned. It also fails silently: the page reloads, so it reads as a slow app rather than a broken link, which is why it survived. `AGENTS.md` names this exact failure mode for admin `?section=&tab=` links (*"a stale link looks like it works — it just quietly lands somewhere else"*); the same hazard applies to any hand-written dashboard href, and this is the only one left in the four dashboards.

**Fix.** The href points at the route, with a comment saying why the anchor form is wrong here. A sweep for `href: "/<role>/dashboard#…"` across all four dashboards returns nothing else.

**Retest.** `THR-DASH-001` step 7: the tap must land on `/therapist/dashboard/availability` with the weekly schedule editor on screen.

---

## 5. What only a live run can establish

The following are **NOT-VERIFIABLE** here and carry real residual risk. They are the areas to run first when an environment exists.

| Area | Why source inspection is insufficient |
| --- | --- |
| **The whole payment funnel end to end** | Signature verification, checkout rendering, callback timing and the webhook race are runtime behaviours. The mechanism is right; whether it fires correctly is untested |
| **Concurrency** (`PAY-CONC-001`, `THR-AVAIL-004`, `FIN-PAY-002`) | Row locks and CAS predicates are present in the SQL. Whether they actually serialise 12 concurrent reserves needs 12 concurrent reserves |
| **Google Calendar / Meet** | Neither the success path nor the capped-retry path can be exercised without credentials |
| **Every screen rendering at all** | A build proves it compiles, not that it paints. No page was loaded in this audit |
| **Mobile at 390 × 844, keyboard nav, focus traps, reduced motion** | Entirely runtime |
| **Copy fidelity** | The plan quotes route-handler strings verbatim; where a component re-words one before display, only a browser will show which the user sees |
| **RLS behaving as written** | Policies exist in the file. Whether the live project has them applied is a different question — and the schema-apply workflow is the only thing that closes it |
| **The reset actually running** | F-01 was found by reading the function. It should be confirmed by running it and counting rows |
| **The audit rows F-11 adds** | The 23 new `recordAdminActivity` calls compile and are placed after their writes. Whether each one lands a readable row is `ADM-SET-033` step 2a, and needs a database |
| **The 28 hoisted routes still behaving** | Type-checked, linted, built and unit-tested. The five spec files covering them were **not** re-run this pass — there was no server to run them against — so `SEC-ROUTE-002` and the therapist/patient specs are the first thing to run when one exists |

---

## 6. Verdict and recommended sequence

**Pass, after remediation, on both passes.** The invariants the plan cares most about — the capture path, the ledger constraints, the append-only triggers, the split identities, the scope guards, the whole-hour rule, the single checkout quote — are all genuinely implemented where the plan says they are. **All thirteen findings are fixed**, including the three documentation defects in the plan itself, and `npm run verify` is green: 384 unit tests in 23 files, lint, and a full production build.

**What pass 2 changes about how to read this report.** Two of its five findings are the same shape: a rule that *was* fixed, in the instances somebody looked at. F-08's ordering fix reached the eleven routes a probe called, and 28 others kept the old order; F-02's schema fix was correct and a table written afterwards copied the pre-fix pattern. Neither was a regression in the ordinary sense — nothing was undone — and neither would have been caught by re-running the check that found it the first time. **The sweeps in §3.13 are the answer to that**, and they are cheap: each one is a few lines of static analysis over the whole repository, and each is worth re-running before every release rather than once per audit.

**One thing still needs a person, not a commit.** The schema changes across both passes — the redefined reset function, the two nullable `reviewer_id` columns, the `pain_assessments` trigger, the `auto_assign_therapist_enabled` column and everything the branch has added since — reach a live database only when `supabase/schema.sql` is applied, either by hand with `node scripts/run-schema.mjs` or by the schema-apply workflow on a push to `main`. **Until that runs, the fixes exist in the file and not in the database**, which is the exact failure mode the schema conventions warn about: the app looks fixed in review and still behaves the old way in production. Apply it, then re-run `SETUP-RESET-001` and confirm the two counts come back zero.

**Then run, in this order:** the §16.3 payment-integrity sweep (highest value per hour, and entirely unverifiable statically), the §21 cross-role checks (they catch disagreements no single-role test can), then the §18 security sweep at the route level, then everything else in the plan's own recommended order.
