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
- Full test run page (all 585 QA cases from docs/qa/src, pass/fail/blocked/N/A + notes, Copy bug list): https://claude.ai/artifact/WhgRuAugzCRCrRfiPAro8e
- Workflow: tester pastes bug lists into chat; Claude logs them here and pushes. No fixing until the tester says so. Cases the tester marks N/A "needs terminal" are for Claude to run later.

## Progress
- Phase 0 setup: done (schema re-apply twice deliberately postponed until before release).
- Phase 1 step A (test accounts) and step B (public pages): reported done by tester.
- Phase 1 step C (C1-C8: patient sign-up, approval, sign-in, forgot password, role gates): in progress.

## Known release blockers
- B-001 Debug bar is visible on the LIVE site (moverestorephysio.com). Delete it before release, do not only hide it.

## Issues found
Format: ID | phase/step | what happened | expected | severity (blocker/major/minor) | status (open/fixed/retest)

B-002 | Phase 1 B (home page / conditions page) | Section "What treatment works towards" has a "Play all six" button. | Remove the button. Play all six kinds of care automatically in a loop, with the same before/after transition as when a tab is tapped. If the visitor taps any one condition tab, stay on that condition until the page is reloaded or they leave and come back. | minor (change request) | open
  - Notes: component src/components/marketing/TreatmentGoals.tsx. This reverses a documented rule (docs/rules/public-site.md "It never advances on its own" and the "carousel that moves on its own" rule), so docs and e2e/treatment-goals.spec.ts TG-001 need updating when it is built. Owner decided; tester asked only to note it, not fix yet.
