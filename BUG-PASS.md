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

## Known failures that were there before the bug pass

- `admin-multi-admin` **H-003** (an approved signup leaves another admin's
  inbox after a reload) fails on unchanged `staging` too. Not caused by any
  fix here; the owner hasn't decided whether to look at it.

## Fix log

| # | Bug | Fix | Commit |
| --- | --- | --- | --- |
| 1 | Approving a therapist didn't ask for their cut, so it got missed | Approve on a therapist opens `ApproveTherapistDialog`: details to check, required revenue share, optional home-visit share, Show on /team, internal note; saved in the same update as `approved`. An admin without money approves without the share. Patients are unchanged. Spec: `admin-approve-therapist` | `12a8576` |
| 2 | Declined patients/therapists/hospital inquiries vanished with no reason | Decline opens `DeclineApplicationDialog` (required reason chips, note required only for Other). `decline_pending_account()` / new `decline_b2b_lead()` snapshot the applicant into append-only `declined_applications` in the same statement. New **People → Declined** tab with Patients/Therapists/Hospitals filters; "Declined before" chip on Approvals rows and new leads; declined leads show their reason on Partners. Account still deleted so they can re-apply. Schema applied twice. Spec: `admin-decline-application` | `458f172` |
| 3 | Paying an unpaid session from the dashboard had no promo field, charged full price (or a stale order's old amount), and abandoned checkouts flooded the admin's assign queue | Pay now on the session card and on Finish your booking goes to `/book?resume=<id>`: Step 3 for that booking, details filled, earlier code re-applied and re-checked; a gone slot opens Step 1 and replaces the draft. `mintAppointmentOrder` re-prices before reusing an open order and mints a new one when the price moved (409 if a payment is in flight); a retry without a code releases the old claim. Newest quote request now wins. Unpaid online drafts leave "Sessions with no therapist" for a non-urgent "Waiting on the patient's payment" row, an Awaiting payment chip and a Waiting on payment filter. Spec: `checkout-resume` | `73f73c0` |
| 4 | Razorpay opened at the old price after a promo was applied to a booking with an open order | Already fixed by #3; RES-002 now also tests the reported order (full-price order first, then a code) and fails on the old route. Spec: `checkout-resume` | `32e2900` |
| 5 | Production refused every promo code: service_role had no EXECUTE on `claim_promo_code` | End of `schema.sql` grants execute on all public functions to service_role plus the default privilege; `check:grants` requires both; `check-live-grants` probes it. Applied to staging twice. **Production still needs `schema.sql` applied** (the hand grant covers only `claim_promo_code`) | `e07bb0e` |
| 6 | Refund refusals hid Razorpay's reason; patient saw "on its way" when it failed | `refundRefusalForAdmin()` quotes Razorpay (balance gets a settle/top-up hint) in the 3 refund routes and admin cancel; patient gets an amount toast and "Refund delayed - our team is sending it by hand". No e2e spec: a refused refund leaves an undeletable attempt row. No balance health check: Razorpay has no balance API | `e3fcfbe` |
