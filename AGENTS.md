# MoveRestore Physiotherapy - agent guide

**Start with `CLAUDE.md`.** It is short on purpose and holds what you need
before you know what the task is: the rules whose failure cannot be undone,
and a table saying which rules file to read for which task.

This file used to hold all of it - 6,250 lines, ~108,000 tokens - and was
loaded into **every single request** of every session alongside `CLAUDE.md`.
That is not paid once: each tool call is a request carrying the whole system
prompt, so a session making forty of them re-read 5 million tokens of rules
to change one file. The content was good; the delivery was the problem. It
is split into `docs/rules/` now and read on demand.

## The rules

| File | Covers |
| --- | --- |
| [`docs/rules/booking.md`](docs/rules/booking.md) | Lead time, the whole-hour rule, the one month grid, the service picker |
| [`docs/rules/payments.md`](docs/rules/payments.md) | Razorpay, the one capture path, idempotency, every refund state, the cancellation window |
| [`docs/rules/money.md`](docs/rules/money.md) | The revenue split and its invariants, payouts, settlements, Business Health, costs |
| [`docs/rules/pay-later.md`](docs/rules/pay-later.md) | A trusted patient treated first and settling afterwards |
| [`docs/rules/discounts.md`](docs/rules/discounts.md) | The four acquisition discounts, promo codes, invites, the checkout quote |
| [`docs/rules/clinical.md`](docs/rules/clinical.md) | Intake, the Pain Map, care plans and their review, session notes, patient files |
| [`docs/rules/roster.md`](docs/rules/roster.md) | Availability, specialisation, readiness, assignment, suggested sessions |
| [`docs/rules/home-visit.md`](docs/rules/home-visit.md) | The delivery mode, service areas, travel fees, cash - plus Calendar and Meet |
| [`docs/rules/programmes.md`](docs/rules/programmes.md) | Consultation first, package purchases, the therapist lock, referrals |
| [`docs/rules/admin.md`](docs/rules/admin.md) | The seven sections, scopes, Settings IA, System Health, the log, exports |
| [`docs/rules/dashboards.md`](docs/rules/dashboards.md) | The four dashboards, the Overview feed, realtime, every way back in |
| [`docs/rules/public-site.md`](docs/rules/public-site.md) | Eight pages from one design system, the photography rules, the splash |
| [`docs/rules/frontend.md`](docs/rules/frontend.md) | Dates, voice, dialogs, disabled controls, toasts, paging, accessibility, style |
| [`docs/rules/data-schema.md`](docs/rules/data-schema.md) | Supabase clients, the bounded fetch, schema conventions, RLS, grants, the ledger |
| [`docs/rules/ops-security.md`](docs/rules/ops-security.md) | Access flags, rate limiting, impersonation, risk signals, the data reset, gotchas |
| [`docs/rules/testing.md`](docs/rules/testing.md) | The commands, the two gears, the SQL checks, the e2e suite, the QA plan |

[`docs/rules/00-index.md`](docs/rules/00-index.md) lists every rule by its
own sentence, so `grep` finds the right file from a symptom.

## Adding a rule

It goes in the `docs/rules/` file for its area, in the same change as the
code - **not** here, and not in `CLAUDE.md` unless its failure is
unrecoverable, silent, or destroys something real. That is the only test for
the always-loaded file, and it is what keeps this cheap.

Write the *why* with the rule. Every one of these exists because something
was found the hard way, and the reasoning is what stops the next reader
"fixing" it back.
