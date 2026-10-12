# Bug pass: working notes for Claude

This file is read at the start of every message during the bug pass,
because the owner runs `/clear` before each one. It holds how to work and
what has already been done. Keep it short; update the log after every fix.
**Never put a secret in this file.**

## How to work (owner's instructions)

1. **Talk terse.** Use the `caveman` skill (full level) for chat replies.
   Commits, code and docs stay in normal prose.
2. **Act as senior product manager and head of design.** Every fix should
   make the UX better, not only stop the bug. Offer ideas when you have them.
3. **Ask before building.** Before changing anything, check whether a flow
   for it already exists (grep `src/`, read the matching `docs/rules/*.md`
   from CLAUDE.md's table). If one exists, or the fix would duplicate or
   overdo something, say so. Then ask the owner the open questions (use
   AskUserQuestion with a recommended option) and wait for the answers.
4. **One bug at a time.** Fix it, then verify it quickly (below). Show the
   result with screenshots via SendUserFile, then commit and push. Don't
   start the next bug until the owner sends it.
5. **Spend little.** Don't run the whole e2e suite per fix. Run only the
   spec covering the change, and keep the output short.
6. **Final reply is short:** what changed, what was verified, the commit.

## Branch

- Work on **`bug-pass`** only. Commit each fix and push:
  `git push -u origin bug-pass`.
- **Never** push or merge to `staging` or `main`. The owner merges
  `bug-pass` into `staging` once every bug is fixed.
- Before that merge: remove the "Bug pass" pointer from `CLAUDE.md` and
  delete this file.
- **PR #97** (bug-pass -> staging, fixes 1-15) was **closed** on purpose so
  every push here doesn't re-run all 7 CI runners. When the next batch is
  done, open a fresh PR bug-pass -> staging (don't reopen #97 mid-batch).
- `main` is never merged by Claude. The owner releases staging -> main by
  hand and applies `supabase/schema.sql` (twice) to production with it.

## Environment (staging Supabase, no real patients)

- Keys live in `.env.local` (gitignored, already filled in: Supabase,
  Razorpay test, Google Calendar). If it is missing (a fresh container),
  ask the owner to paste the keys again. Never commit them.
- `GOOGLE_CALENDAR_ID` is **not set** yet, so Meet links can't be verified.
- The owner allows seeding, e2e runs and DB access against this project.
- Port 5432 is blocked from the container. Run SQL through the Management
  API instead:
  `curl -s -X POST https://api.supabase.com/v1/projects/hqhhnkjkrpyhudmgmawm/database/query -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"..."}'`
- Load env in a shell: `set -a; . ./.env.local; set +a`
- QA accounts are seeded (`npm run seed:qa`). Password `QaTest!2024pass`;
  admin is `qa.admin@example.test`. Helpers are in `e2e/helpers.ts`.

## Verifying a fix

```bash
npm ci                               # only if node_modules is missing
(nohup npm run dev > /tmp/dev.log 2>&1 &)   # if localhost:3000 is not up
set -a; . ./.env.local; set +a
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  npx playwright test e2e/<spec>.spec.ts --project=desktop --reporter=line
npm run verify                       # lint + unit tests + build, before pushing
```

- Never run `playwright install`. Without `PLAYWRIGHT_CHROMIUM_PATH` the
  browser fails to launch.
- For screenshots, write a throwaway spec (`e2e/zz-shot.spec.ts`), save the
  images to the scratchpad, send them, then delete the spec.
- A new spec needs an entry in `e2e/coverage-manifest.json` (spec plus
  flow, inserted by hand so the formatting stays), then
  `node scripts/ci/check-coverage-manifest.mjs --write-doc`. Also add a row
  to `e2e/README.md`.
- JSX text that wraps across lines must not contain `&apos;` or other
  entities (`jsxEntitySpacing.test.ts` fails on it). Use `{"...'..."}`.
- `npx tsc` without a build shows `public/` image import errors and
  `rowActivation.test.ts` errors. Both were there before the bug pass;
  ignore them.

## CI: what turned the gate red last time (check before pushing)

Every one of these was catchable locally. Run them before the PR push:
`npm run verify`, `npm run check:coverage`, `npm run check:realtime`,
`npm run check:context-budget`, plus the specs for what changed.

- A table the admin dashboard page reads via `.from("x")` must be in
  `ADMIN_REALTIME_TABLES` (`AdminShell.tsx`) **and** get
  `alter publication supabase_realtime add table x` (duplicate_object
  wrapper) in `schema.sql` -- H-006 fails otherwise.
- The admin dashboard keeps every section mounted (hidden): selectors need
  `.filter({ visible: true })` or an exact role/name match.
- A spec that creates its own patient/therapist must call
  `markDashboardTourSeen(email)`, or the first-visit tutorial covers the page.
- Race specs must accept either order (two winners serialised is fine;
  annotate it) rather than assume the requests overlapped.
- The layout audit treats overlaps as failures; adornments inside an
  input's reserved padding (password eye) are exempt in `layoutProbe.ts`.
- Triage a red runner from its `failure-bundle-<runner>` /
  `reports-<runner>` artifact (`failure-bundle.md`, `report.json`) only --
  never the raw job log. Fix every red runner, then push **once**.

## Fix log

| # | Bug | Fix | Commit |
| --- | --- | --- | --- |
| 1 | Approving a therapist didn't ask for their cut, so it got missed | Approve on a therapist opens `ApproveTherapistDialog`: details to check, required revenue share, optional home-visit share, Show on /team, internal note; saved in the same update as `approved`. An admin without money approves without the share. Patients are unchanged. Spec: `admin-approve-therapist` | `12a8576` |
| 2 | Declined patients/therapists/hospital inquiries vanished with no reason | Decline opens `DeclineApplicationDialog` (required reason chips, note required only for Other). `decline_pending_account()` / new `decline_b2b_lead()` snapshot the applicant into append-only `declined_applications` in the same statement. New **People → Declined** tab with Patients/Therapists/Hospitals filters; "Declined before" chip on Approvals rows and new leads; declined leads show their reason on Partners. Account still deleted so they can re-apply. Schema applied twice. Spec: `admin-decline-application` | `458f172` |
| 3 | Paying an unpaid session from the dashboard had no promo field, charged full price (or a stale order's old amount), and abandoned checkouts flooded the admin's assign queue | Pay now on the session card and on Finish your booking goes to `/book?resume=<id>`: Step 3 for that booking, details filled, earlier code re-applied and re-checked; a gone slot opens Step 1 and replaces the draft. `mintAppointmentOrder` re-prices before reusing an open order and mints a new one when the price moved (409 if a payment is in flight); a retry without a code releases the old claim. Newest quote request now wins. Unpaid online drafts leave "Sessions with no therapist" for a non-urgent "Waiting on the patient's payment" row, an Awaiting payment chip and a Waiting on payment filter. Spec: `checkout-resume` | `73f73c0` |
| 4 | Razorpay opened at the old price after a promo was applied to a booking with an open order | Already fixed by #3; RES-002 now also tests the reported order (full-price order first, then a code) and fails on the old route. Spec: `checkout-resume` | `32e2900` |
| 5 | Production refused every promo code: service_role had no EXECUTE on `claim_promo_code` | End of `schema.sql` grants execute on all public functions to service_role plus the default privilege; `check:grants` requires both; `check-live-grants` probes it. Applied to staging twice. **Production still needs `schema.sql` applied** (the hand grant covers only `claim_promo_code`) | `e07bb0e` |
| 6 | Refund refusals hid Razorpay's reason; patient saw "on its way" when it failed | `refundRefusalForAdmin()` quotes Razorpay (balance gets a settle/top-up hint) in the 3 refund routes and admin cancel; patient gets an amount toast and "Refund delayed - our team is sending it by hand". No e2e spec: a refused refund leaves an undeletable attempt row. No balance health check: Razorpay has no balance API | `e3fcfbe` |
| 7 | Couldn't find a patient from a Razorpay payment/order id or a session/programme code | People -> Patients search also matches `pay_...`, `order_...`, session and programme codes (`src/lib/paymentSearch.ts`); the matched card shows a chip saying which. Payment/order ids only for Money scope. Spec: `admin-payment-search` (leaves one `order_e2esearch...` payments row; `clean:e2e` removes it). Two earlier fixture rows (`order_QaSearch...`, `order_QxR7gZ1aB3cDef`, Rs 1, status created) are still on staging: deleting them needs the payments trigger lifted, which the session wasn't allowed to do | `915ba03` |
| 8 | Therapist display content lost every Enter on /team (one long line) and had no formatting | Docs-style editor (`RichTextEditor`, Tiptap 3.31.4) for the admin display content **and** the therapist's bio: headings, bold/italic/underline/strike, lists, quote, link, align, undo/redo, clear. Saved = grey read-only view in the same formatting + Edit; Cancel with changes asks (Discard / Keep editing); View on /team link. Stored as editor JSON, allow-listed by `src/lib/richText.ts` on write and render, rendered as React elements (no HTML). Old plain text keeps its paragraphs. Bio now saves via new `/api/therapist/update-bio` (sanitises, revalidates /team). Spec: `rich-text-profile` | `7157fa3` |
| 9 | No tutorial for new users; health profile and session states were unexplained | Animated first-visit tutorial for patient, therapist and hospital with dummy data (Priya / Dr Ananya), Done fades to the real dashboard; Skip asks once; both record `onboarding_seen_at` via new `/api/dashboard/tutorial-seen` (replaces patient-only `dismiss-onboarding` + old `OnboardingTour`). Scenes animate the real states (session journey, programme, refunds, health profile locked/ready/review, triage/intake/Pain Map/recommend, earnings, referral statuses). (i) on every page title (automatic), key cards (`SurfaceCard info=`) and every Home feed row replays its chapter. Content `src/lib/tutorial.ts` (test fails on a page with no chapter); stage `src/components/tutorial/`; mounted by `TutorialGate` in each role layout. Global setup marks QA accounts seen. Spec: `dashboard-tutorial` | `9075f86` |
| 10 | "Open the roster" in Unable to assign changed the page behind the dialog and drawer | Switches screens in place, closes the dialog; drawer closes when its screen is left; roster opens on that therapist (`view=therapist:<id>`, `src/lib/rosterView.ts`). Spec: `assign-availability` AV-002 | `5d68e39` |
| 11 | Session Details showed only the slot time | "Date & time": weekday + date above the range. Spec: AV-002 | `5d68e39` |
| 12 | Therapist's new patient: onboarding only a feed row | Banner above Home greeting, amber strip on the session card, Start onboarding opens triage (`?start=onboarding`), "How onboarding works" 8-step guide (all three condition types, real question sets) kept out of the first-visit tour. Spec: `therapist-onboarding` | `de572c1` |
| 13 | "The Meet link will show here - you can join from X" stayed after X | From the join time with no link: amber "isn't ready yet - contact the clinic". Spec: `session-completed-cutoff` SC-012 | `952e38e` |
| 14 | Session note refused "once the session has taken place" after it started | Root cause: debug clock. Note route reads `serverNowMs()` and the dialog sends the offset (like Done); refusal names the time. Opens at session start (owner's choice). Spec: `debug-clock` DC-003 | `7fc1faa` |
| CI | Gate fixes for PR #97 | ACP-020 visible filter; RES-001 + clinical-continuity mark tour seen; `declined_applications` + `payments` realtime (schema applied to staging twice); layout adornment exemption; H-003 exact Approve match; concurrency refund race order-tolerant | `1d53e42`, `ac1ea47`, `d934d37` |
| 15 | "You can see this number around the time of the session" during the session | Same debug-clock cause in `reveal-contact`; refusal names when it opens/closed; home-visit day judged in IST not UTC. Spec: DC-004, `contactMasking` unit tests | `7fc1faa` |
