# Release test log

Working notes for the pre-release manual test. The tester (no terminal, browser only)
reports results; Claude records them here so nothing is lost when the chat is compressed.
Delete this file before the release PR if it is not wanted in the repo.

## Setup facts (no secrets here)
- Staging site: https://staging.moverestorephysio.com
- Staging Supabase project ref: hqhhnkjkrpyhudmgmawm (dr-pooja-physio-mumbai). Live uses a different project.
- Razorpay: test keys. Google Calendar/Meet: configured on staging.
- Test accounts come from the debug bar (Master Admin, Test accounts panel). `seed:qa` is not used.
- Dev branch: claude/wizardly-bell-ba7wr0. Never merge to main.
- Code checks run in the sandbox: lint 0 errors, 3394/3394 unit tests, build passes (needs NODE_OPTIONS=--max-old-space-size=6144 in the sandbox).
- Plan page (flowcharts + checklist): https://claude.ai/artifact/FWTRqAmmpWUDUAgJ4Kp1he

## Progress
- Phase 0 setup: done (schema re-apply twice deliberately postponed until before release).
- Phase 1 step A (test accounts) and step B (public pages): reported done by tester.
- Phase 1 step C (C1-C8: patient sign-up, approval, sign-in, forgot password, role gates): in progress.

## Known release blockers
- B-001 Debug bar is visible on the LIVE site (moverestorephysio.com). Delete it before release, do not only hide it.

## Issues found
Format: ID | phase/step | what happened | expected | severity (blocker/major/minor) | status (open/fixed/retest)

(none reported yet)
