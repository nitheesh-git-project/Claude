# The pre-merge quality gate

`.github/workflows/quality-gate.yml` runs on every pull request into
`staging` and into `main` (the owner's release PR). It is the one check
that should block a merge. This file covers
how it works, what it proves and what it does not, how to set it up as
required, and how to reproduce a red run. It is read on demand: nothing
loads it into a session automatically.

**A green gate means these tests passed on this commit. It is not proof
that the application has no bugs.** `docs/ci/COVERAGE.md` lists, per
runner, what is covered, what is only partly covered, and what nothing
proves yet.

## Pipeline

```
pull request -> staging | main
  ├─ context-budget      CLAUDE.md / AGENTS.md byte budgets, no @-imports, no SessionStart hooks
  ├─ coverage-manifest   every e2e spec owned by a runner; no runner empty; no silent coverage loss;
  │                      scripts/ci/runner-shards.json fits the manifest
  ├─ verify              npm run lint + npm test + npm run build (stub Supabase), as in ci.yml
  └─ plan                runner-shards.json -> the job matrix (seconds)
        │  (only `plan` gates the runners; the other three run beside them)
        ▼
  runner (<runner> or <runner>-<i>of<n>)   19 parallel jobs: 8 runners, some split into shards
        │  each on its own machine with its own disposable Supabase stack
        ▼
  quality-gate           if: always(); green only if every job above succeeded
                         AND every runner × shard uploaded a `passed` summary with tests in it
                         AND each runner's shards were, between them, given every spec it owns
        ▼
  human review, then merge (never automated; a release to main is the owner's, by hand)
```

`ci.yml` runs `verify` on pushes to `staging` and `main` only. For a pull
request the gate's own `verify` is the one copy, because a job can only
`need` a job in the same workflow, and a second copy would take a machine
the runners need (see Timing). The Playwright suite runs exactly once per
commit, split across the runner jobs, never twice.

## Runners

Each runner owns a set of specs in `e2e/coverage-manifest.json`. The
validator fails if any spec has no owner. Shared and public specs belong to
`platform`, so none fall through the gaps.

| Runner | Owns | Notable |
| --- | --- | --- |
| `patient` | booking, intake, the booking wizard, isolation, documents, the phone view | `patient-isolation.spec.ts` |
| `money` | checkout and its resume, discounts, promo codes and invites, pay later, programme and package purchases, care plans and recommendations, the admin money screens, payment search, the refund-attempt ledger | `pay-later.spec.ts` |
| `therapist` | roster, readiness, specialty, the therapist's phone view | |
| `session` | scheduling, suggestions, completion cutoff, clinical continuity | `clinical-continuity.spec.ts` |
| `admin` | authorization, exposure, validation, navigation, account lifecycle, layout | the admin login form runs against the same app; `layout-audit.spec.ts` |
| `hospital` | referrals, partner isolation | `hospital-isolation.spec.ts` |
| `platform` | the public site, splash, catalog, form controls, mobile smoke | |
| `integrity` | the SQL check files, authorization/concurrency/live-grant scripts, degraded schema | destructive specs run last, in their own Playwright invocation |

Flow ids keep the prefix of the runner that first owned them
(`patient.pay-later` belongs to `money`), so the coverage baseline did not
have to be rewritten. `integrity.refund-attempt-ledger` stays with
`integrity`, which runs its SQL check, while its spec runs in `money`.

## Shards

`scripts/ci/runner-shards.json` is the one place a runner's split is set,
and three things read it through `scripts/ci/lib/shards.mjs`: the `plan`
job (the matrix), `run-runner.mjs --shard i/n` (which files a shard runs),
and the verdict (which summaries must exist). Today:

| Runner | Jobs | Measured spec time per job |
| --- | --- | --- |
| `admin` | 8 | ~220 s |
| `platform` | 2 | ~235 s |
| `money` | 2 | ~220 s |
| `therapist` | 1 | ~190 s |
| `session` | 1 | ~160 s |
| `patient` | 2 | ~140 s |
| `integrity` | 1 | ~45 s plus its scripts |
| `hospital` | 1 | ~15 s |

`node scripts/ci/plan-shards.mjs` prints the current figures. How a runner
is split:

- **Whole files, longest first, onto the least-loaded shard**, by the
  per-file seconds in the config (`seconds.bySpec`, measured from a CI run's
  reports). The assignment is deterministic, so a local re-run of a shard
  runs the same files CI did. A stale or missing duration can unbalance a
  runner; it can never drop a file.
- **A file listed in `splitFiles` runs in every shard, a 1/n slice each**,
  through Playwright's own `--shard=i/n` on that one file. Only a file whose
  tests are independent may be listed, and it must declare
  `test.describe.configure({ mode: "parallel" })` (the validator checks),
  or Playwright keeps it whole. Today: `layout-audit.spec.ts` (82 read-only
  page checks, 12 of the old admin runner's 32 minutes) and
  `admin-dashboard-ui.spec.ts`. `playwright.config.ts` keeps
  `fullyParallel: false`: other specs rely on in-file order and a shared
  `beforeAll`.
- **The integrity scripts and SQL checks run on shard 1, and a runner that
  owns any is never split.** Some read rows the runner's specs leave behind,
  and a split would leave them on another machine. The validator refuses
  the config.
- **Every shard must have a spec**, and the total stays at or under
  `maxRunnerJobs` (19): GitHub runs 20 jobs at once on this plan, `verify`
  takes one, and a queued job is minutes on the critical path.
- A shard's artifacts, summary and job are named by its label
  (`admin-2of8`); an unsplit runner keeps its plain name (`hospital`).

To rebalance: change a count or `splitFiles`, run
`node scripts/ci/plan-shards.mjs` and `npm run check:coverage`, and refresh
`seconds.bySpec` from a recent run's `reports-*` when the numbers have
drifted.

## Timing

The target is a whole gate, pull request to verdict, in about six minutes.
Per runner job, before this change, setup took about three minutes and the
admin runner's tests 32. Now:

- **The stack starts first, in the background**
  (`provision-local-stack.sh --start-only`), so its image pulls overlap
  `npm ci`, the browser and the caches. The images it needs are pulled in
  parallel (the CLI alone pulls one after another), and only the services
  the app uses are started. The provisioning step then waits for its
  verdict, applies the schema and seeds.
- **The runners start as soon as `plan` has run**, beside `verify` rather
  than after it.
- **Caches**: Chromium (keyed on the installed Playwright version), the
  production build's `.next/cache` in `verify`, and `next dev`'s Turbopack
  cache (`.next/dev/cache`, per runner, saved by shard 1 after a pass when
  under 2 GB). Turbopack checks every entry against the files on disk, so
  an old entry costs time, never correctness. Docker images are not cached:
  restoring a multi-gigabyte tarball and `docker load`-ing it costs about
  what the parallel pull costs, so it would add a moving part for nothing.
- **Warm-up**: once `next dev` answers, the runner requests the main public,
  login and dashboard pages once, in parallel (at most
  `GATE_WARMUP_SECONDS`, default 90), so their first compile is not charged
  to a spec's timeout. It never fails the runner.
- **Concurrency**: 19 runner jobs plus `verify` fit GitHub's 20. That is
  also why `ci.yml` no longer runs on pull requests.

`scripts/ci/run-runner.mjs <runner> [--shard i/n]` does this, in order
(without `--shard` it runs the whole runner, every shard's files in turn):

1. Runs the preflight.
2. Selects the shard's specs from the manifest and the shard config.
   Selecting none is a failure.
3. Starts one `next dev` with the egress guard preloaded, and warms it.
4. Runs the integrity scripts that build their own fixtures (shard 1).
5. Runs the specs for each Playwright project.
6. Runs the SQL checks that need rows the specs leave behind (shard 1).
7. Runs the destructive specs.
8. Writes `e2e-artifacts/<label>/summary.json`, naming the runner, the
   shard and the spec files it was given.

`scripts/ci/lib/runner.mjs` decides the verdict. The runner fails on any of
these:

- a failed test
- a flaky test (a pass on retry is not a pass)
- a skip the manifest does not declare in `allowedSkips`, with its reason
- a Playwright project that produced no report
- a nonzero exit with nothing failed to explain it
- a failed integrity script
- any refused outbound request
- a blocked preflight (missing Razorpay test keys)

Playwright runs once per spec file, and between files the runner restarts
`next dev` if it has stopped answering or grown past
`GATE_DEV_RSS_LIMIT_MB` (default 9216). One browser spec alone takes the
dev server to 6.5–8.5 GB resident. On the first full local run, one
long-lived server stopped answering partway through the patient runner,
with nothing failing in the app. A restart never happens in the middle of
a file, and the job log records each one as a notice that names its cause
(exited, over the limit, or the probe's error). The health probe opens a
fresh connection every time: a reused keep-alive socket once failed with
`UND_ERR_SOCKET` against a healthy server and restarted it for nothing. A
restart waits for the old process group and the port to be gone (SIGKILL
after 20 s) before it starts the next server, because two dev servers
sharing `.next/dev` answered existing routes with 404s.

`scripts/debug-reset-sql-checks.sql` is never run: it takes
`AccessExclusiveLock` on every table, and `ALLOW_DEBUG_DATA_RESET` stays
unset everywhere.

## Isolation and the safety preflight

Every runner job builds its own stack with
`scripts/ci/provision-local-stack.sh`. That gives it Postgres, Auth,
PostgREST, Storage and Realtime behind the Kong gateway, from the Supabase
CLI (pinned in the workflow), on the machine's loopback interface. Nothing
else is started (`supabase start -x`): Studio and postgres-meta, imgproxy,
Edge Runtime, Logflare and Vector, Supavisor, and Mailpit. Each was checked
unused in `src/`, `e2e/` and `scripts/`; the script's header says why per
service. Mailpit is the one that config.toml had on: email confirmations
are off, no spec asks for a reset or magic link, and the admin access links
use `generateLink`, which sends nothing. Docker once failed to bind its
port and took a run down. If `supabase start` fails, the script stops what
started and tries exactly once more. It then:

1. Refuses to run if a `.env*` file is in the workspace.
2. Runs the preflight in static mode, before any write.
3. Applies `supabase/schema.sql` twice:
   - Pass 1 runs as `postgres`, so object ownership matches hosted staging.
   - Pass 2 runs as the local superuser, to prove the file re-runs. It has
     to: on the local image only, once a caught `duplicate_object` from
     `alter publication ... add table` has fired in a session, `postgres`
     can no longer drop `storage.objects` policies in that session.
4. Writes a `ci_meta.ci_target_marker` row.
5. Runs the preflight again with a database probe.
6. Seeds the QA fixtures.

The per-runner Next.js instance, fixture accounts and artifact directory
are its own.

`scripts/ci/preflight.mjs` (rules in `scripts/ci/lib/target.mjs`) fails
closed. It is **unsafe** (exit 1, nothing runs) when any of these holds:

- The Supabase URL, `E2E_BASE_URL` or `DATABASE_URL` is not loopback, or is
  missing or unparseable. A hosted `*.supabase.co` is named as such.
- A Supabase key is missing.
- `SUPABASE_ACCESS_TOKEN` is set. It reaches hosted projects through the
  Management API.
- `ALLOW_DEBUG_DATA_RESET` is set.
- Any `GOOGLE_CALENDAR_*` variable is set.
- Any Razorpay credential is `rzp_live_`-shaped, or a key id is not
  `rzp_test_`.
- The probe cannot run, finds no marker row, or finds any auth user that
  is not an `@example.test` fixture.

A variable named "test" is not taken as proof of anything: the marker and
the fixture-only probe are what identify the stack. It is **blocked**
(exit 3) when the target is safe but the Razorpay test keys are missing or
placeholders. A blocked runner never passes.

**The egress guard.** `scripts/ci/egress-guard.mjs` is preloaded into
`next dev` and the Playwright runner. It refuses every Node-level request
to any host except loopback, `api.razorpay.com` (only with a real
`rzp_test_` key) and the Google Fonts CDN, and logs each refusal. One
refusal fails the runner even if the code that made the request swallowed
the error. The only stub is `next dev`'s own check for a newer Next.js
version, which has no switch, carries no data, and is answered locally
with a 404. In the browser, Chromium is started with
`--host-resolver-rules` that resolve nothing except loopback,
`*.razorpay.com` and the font CDN.

What the integrations prove:

| Integration | Mode in the gate | What a pass proves | What still needs a real sandbox |
| --- | --- | --- | --- |
| Supabase (DB, Auth, Storage, RLS, Realtime) | local, real | The schema, policies, grants, triggers and routes behave as asserted | Hosted-only behaviour: the Management API, connection pooling, hosted storage limits |
| Razorpay | provider sandbox (test keys) for order creation; checkout sheet not driven | Orders are created in test mode; amounts are server-derived | Completing the hosted checkout, signed webhooks, refunds (see the `blocked` flows) |
| Google Calendar / Meet | absent (credentials refused) | The app's "not configured" path; no event is ever created | Real event and Meet-link creation and retry |
| Email / SMS | not started (no Mailpit in the gate); no provider exists in the codebase | Nothing is sent anywhere | n/a until a provider is added |

## Setup the owner must do

These steps are not automated, and nothing in this change performs them.

1. **Add two repository secrets** under Settings → Secrets and variables →
   Actions → *Repository* secrets (not Environment, Codespaces or
   Dependabot):
   - `RAZORPAY_TEST_KEY_ID`: a `rzp_test_` key id
   - `RAZORPAY_TEST_KEY_SECRET`: its secret

   Until both exist, every runner reports **BLOCKED** and the gate is red.
   That is intended: a run that could not exercise checkout has not proven
   it. Never use a live key. The preflight refuses one anyway.
2. **Make the gate required on `staging`.** Settings → Rules → Rulesets.
   Edit the ruleset that protects `staging` (or create one targeting it),
   enable *Require status checks to pass*, and add **`quality-gate`**. In
   the check picker it appears as *quality-gate* from the *Quality gate*
   workflow, after the workflow has run once. Require **only**
   `quality-gate`: it already depends on `verify`, `plan`,
   `coverage-manifest`, `context-budget` and every runner job, and the
   runner jobs' names (`runner (admin-2of8)` and so on) change whenever
   `runner-shards.json` does. A required `runner (admin)` from before the
   split would wait forever; remove any such entry. Workflow success alone
   does not block a merge; only the ruleset does.

   **`main` too, in this order.** The workflow triggers on pull requests
   into `main` as well, so the release PR (staging -> main) runs the whole
   gate against the code about to go live. It touches only its own
   disposable stacks, never the production Supabase project or the live
   site. Add `quality-gate` to the `main` ruleset only **after** the
   trigger is on `main` (this change has merged) and you have seen it pass
   on a release PR: a required check that no workflow produces leaves the
   PR waiting on "Expected" forever. A workflow edit made in a PR runs from
   that PR's own head, so the release PR carries the trigger with it.
3. **Optional: staging smoke.** Set repository *variables* (not secrets)
   `STAGING_URL`, and `PRODUCTION_URL` so the smoke check can refuse it.
   Then `.github/workflows/staging-smoke.yml` runs anonymous GETs against
   staging when a deployment of the `staging` branch succeeds, or by hand.
   Pull-request previews never trigger it. It does not run automatically
   until `STAGING_URL` is set, and it is not a required check.

**Pull requests from forks** get no secrets, so their runners report
BLOCKED and the gate is red. Run them by pushing the branch to this
repository instead. The workflow uses `pull_request`, never
`pull_request_target`, so untrusted code never runs with secrets.

## Artifacts and evidence

Per runner job, named by its label (`admin-2of8`, or `hospital` for an
unsplit runner), uploaded whether it passed or failed:

| Artifact | Contents | Retention |
| --- | --- | --- |
| `summary-<label>` | `summary.json` (what the gate reads) and `summary.md` | 14 days |
| `reports-<label>` | Playwright JSON and JUnit; logs for `next dev`, Playwright, provisioning and each integrity script; `egress-denied.log` | 7 days |
| `traces-<label>` (on failure) | Playwright traces, screenshots and the HTML report (not sanitised; see below) | 7 days |
| `failure-bundle-<label>` (on failure) | `failure-bundle.md`; see `docs/ci/INVESTIGATE.md` | 14 days |

`summary.json`, `summary.md`, the bundle and every log pass through
`scripts/ci/lib/sanitize.mjs`. It removes JWTs, Supabase, Razorpay and
Google credentials, `KEY=value` secrets, Bearer and Cookie headers, auth
cookies, signed-URL tokens, database passwords, non-fixture email addresses
and Indian mobile numbers. Playwright's console output goes through it
line by line, and the JSON and JUnit reports are rewritten through it after
each run, since a failed request's call log prints its cookie header.
**Traces, screenshots and the HTML report are binary and are not
rewritten.** They hold only synthetic fixtures, the CLI's public demo keys
and short-lived local session cookies, which is why they are uploaded only
on failure and have the shortest retention. Every summary carries
the commit SHA, the run id, the machine name, the stack version, the
shard, the spec files it was given and the runner's known limitations
from the manifest.

## Classifying a failure

| | Meaning |
| --- | --- |
| P0 | Critical exposure, data corruption, or severe operational impact |
| P1 | A core flow is unusable, or a serious clinical, financial or authorization defect |
| P2 | A meaningful functional defect with a workaround |
| P3 | A minor presentation or usability issue |

Every required failure blocks the merge, whatever its priority.
`docs/ci/INVESTIGATE.md` is the fix-and-retest procedure and the prompt
to use with Claude Code. No CI job calls an AI service.

## Before the push

`npm run check:merge-ready` runs the static jobs and lists the specs the
change can reach. `-- --e2e` runs those specs against the project in
`.env.local` and prints only the failures. Rules and flags:
`docs/rules/testing.md`, "The pre-merge quality gate". It catches most of
what a runner would, so a PR's first CI run is a confirmation rather than a
discovery.

## Reproducing locally

Needs Docker, the Supabase CLI (the version in the workflow's
`SUPABASE_CLI_VERSION`), `psql` and `npm ci`. Run it in a shell with **no
hosted credentials** in its environment. The preflight refuses a shell that
carries `SUPABASE_ACCESS_TOKEN` or `GOOGLE_CALENDAR_*`, as it should.

```bash
export NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...   # test keys only
export RAZORPAY_KEY_SECRET=...
GITHUB_ENV=.gate.env scripts/ci/provision-local-stack.sh
set -a; . ./.gate.env; set +a
node scripts/ci/run-runner.mjs hospital           # or any runner (all its shards' files)
node scripts/ci/run-runner.mjs admin --shard 2/8  # one shard, exactly as CI ran it
npx playwright test e2e/hospital-isolation.spec.ts   # one spec, same stack
supabase stop --no-backup                         # throw the stack away
```

`.gate.env` and `e2e-artifacts/` are gitignored. If the sandbox has no IPv6
(the Realtime container binds `::`), `supabase start` fails with
`eafnosupport`. GitHub's runners have IPv6. A sandbox needs a locally
patched Realtime image, which is not part of this repository.

## Changing the gate

- **A new spec** must be added to `e2e/coverage-manifest.json` (`specs` and
  at least one flow citing its test ids), plus a row in `e2e/README.md`, in
  the same commit. Then run
  `node scripts/ci/check-coverage-manifest.mjs --write-doc` to regenerate
  `docs/ci/COVERAGE.md`. It lands in a shard by itself; add its measured
  seconds to `scripts/ci/runner-shards.json` once a run has them.
- **A new runner** goes in `RUNNERS` (`scripts/ci/lib/manifest.mjs`), the
  manifest's `runners`, and `runner-shards.json`, in one commit.
- **Removing a spec or a covered flow** needs a `removed[]` entry with a
  reason and who reviewed it. The baseline (`e2e/coverage-baseline.json`)
  makes silent shrinkage a red check. Grow the baseline with
  `--update-baseline` after review.
- **A required flow** cannot be `gap` or `blocked`. Deciding that one of
  today's gaps becomes required is an owner decision, and covering it
  comes first.
- The gate's own logic has unit tests in `scripts/ci/lib/*.test.mjs`
  (`npm test`), including unsafe targets, missing credentials, empty
  runners, unowned specs, skipped, cancelled or failed jobs, coverage
  routing and sanitisation.
