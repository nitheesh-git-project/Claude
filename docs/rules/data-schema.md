# The database, and talking to it

Which Supabase client, the bounded fetch, PostgREST's silent row cap, schema conventions, RLS, function grants, the credit ledger, and why there is no cron.

**Mostly lives in:** supabase/schema.sql · src/lib/supabase/ · src/lib/sessionCredits.ts · readAllRows.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

## Supabase clients - pick the right one

- `src/lib/supabase/client.ts` - browser, anon key, RLS applies.
- `src/lib/supabase/server.ts` - server components / route handlers, acts as
  the signed-in user.
- `src/lib/supabase/public.ts` - unauthenticated server reads of public data.
- `src/lib/supabase/admin.ts` - service role, **bypasses RLS**. Server-only.
  Use it only after an explicit auth check, and never import it into anything
  that can reach the browser.

**Every server-side one of those four shares one `fetch`, and that is not a
detail.** `src/lib/supabase/resilientFetch.ts` is passed as `global.fetch`
to `admin.ts`, `public.ts`, `server.ts` and `proxy.ts`, and a new server
client gets it too. It does three things, each of which is a failure that
was measured rather than imagined:

1. **It caps how many requests may be in flight to Supabase at once** (96 by
   default, `SUPABASE_MAX_IN_FLIGHT`). Node's fetch opens a socket per
   request and will happily open thousands. The admin dashboard fires ~82
   queries per render, so 40 concurrent admins is ~3,300 requests against
   one origin: the TLS handshakes queued past undici's 10-second connect
   timeout and the render's own isolated guards turned the failures into
   empty panels. Fifteen renders in that run answered **HTTP 200 having
   lost the appointments table** -- the query that feeds Overview, Calendar,
   Sessions and every money figure. The database answered 400 concurrent
   requests in 4.6s with no errors in the same run, so the origin was never
   what broke.
2. **It puts a deadline on every request** (20s, `SUPABASE_REQUEST_TIMEOUT_MS`).
   undici's default body timeout is five minutes, and a socket stuck that
   long holds a slot the requests behind it need.
3. **It retries a GET once on a transport error, and never a write.** The
   ledger RPCs, `record_payment_capture` and `claim_promo_code` are all
   idempotent, but on keys this layer cannot see -- so the decision to
   repeat belongs to the caller, and the default is not to. An HTTP error
   status is never retried either: a 500 from PostgREST is an answer.

The cap is **measured, and a cap that is too tight is its own failure**: at
40 concurrent renders, 48 gave a p50 of 130s, 96 gave 15.3s and 192 gave
16.4s. A page render is a chain of query batches rather than one batch, so
every sequential step pays the queue's whole depth again -- which is why
halving the cap multiplied latency by eight instead of two. Past ~96 the
database's own throughput is the limit (flat at ~290ms a query, ~330 queries
a second, from 8 concurrent to 96), so a higher number buys nothing and only
widens the burst this exists to stop.

**PostgREST caps every response at `max_rows`, and this project's is 1,000.**
That is not a setting this app chose and no call site mentions it: a
`.select()` with no `.range()` does not read the table, it reads the first
thousand rows and answers **200 with no error**. Nothing distinguishes that
from a table that genuinely holds a thousand rows -- so a figure summed over
one of those arrays is not slow, it is **understated**, and every screen agrees
with every other screen because they all sum the same prefix. The admin
dashboard's appointments read is what every Money figure sums over, so it goes
through `src/lib/supabase/readAllRows.ts`, which pages to the end. Three rules:
its page size sits **under** `max_rows`, because asking for exactly the cap
makes "a full page" and "the server truncated me" the same observation; it is
bounded, since it runs inside a render, and a bound it *hits* is reported
(`truncated`) rather than hidden, landing on `AdminDataLoadBanner` in amber
with "narrow the date range" -- amber because the figures are short rather than
garbage and the action differs from a failed read's; and an error on any page
yields **no** rows, because half a table presented as a whole one is this
module's own failure mode one layer in. A new read that something *sums* takes
this helper; a read that fills a list an admin scrolls does not need it.

**A read that failed is not a read that came back empty, and the admin
dashboard now says which.** Every read on that page is isolated so one
failure costs its own panel -- and the cost of that isolation is that a
failed read renders as an empty one. `AdminDataLoadBanner` is the sentence
saying so, above the health banner, for every scope: a `console.error` is
not a place a clinic owner looks, and a zero meaning "nothing happened" and
a zero meaning "we could not ask" are opposite facts that render
identically. The same correction was applied to the two routes where an
unreadable `home_visit_enabled` was being reported to a patient as the
clinic having withdrawn the service: `/api/home-visit/check-area` and
`/api/care-plan/create-order` still refuse (failing closed is the safe
direction for "do we come to you") but answer **503 "we couldn't check"**
rather than 403 "home visits aren't available", because those two send a
patient to two different places.

**One Node process renders everything, so production runs several.**
`npm run start:cluster` (`scripts/start-cluster.mjs`) forks `WEB_CONCURRENCY`
workers -- cores, capped at 4 -- on one port through `node:cluster`, which
hands each accepted connection to a worker off the primary's shared handle,
so nothing sits in front of it. `next start` still works and is still what a
single-process host should run.

It exists because the JS thread was the queue once the database was not:
with 200 concurrent visitors browsing the public pages, one admin dashboard
render went from 4.0s to 15.9s while Supabase held a flat ~290ms a query
throughout. Four workers: the public site went from 395 to 580 requests a
second and that same render to 11.3s.

Two things are per **process**, not per server, and the script handles both
rather than leaving them to be discovered:

1. **The lazy sweeps' minimum intervals.** `retryDueMeetSyncs` and
   `retryDueMeetAccess` hold a minute, `runRiskSweep` five, each in a
   module-level timestamp whose comment says "per server instance". With N
   workers the clinic can see up to N sweeps per window. Safe -- each claims
   its rows before calling Google and each row carries its own attempt cap --
   but it spends an appointment's automatic retries faster, which is why the
   worker count is capped rather than set to one per core.
2. **`SUPABASE_MAX_IN_FLIGHT`.** Left alone, four workers would carry four
   times the measured socket budget. The script divides a 192-request budget
   across the workers instead, and 192 rather than 96 is itself measured:
   dividing 96 four ways gave each worker 24, which queued every ~56-query
   batch two deep and pushed a *single* admin render on an idle server from
   4.0s to 6.7s -- a regression handed to the quiet case to protect the busy
   one. 4x48 gives 3.7s alone and 11.3s contended at 580 public rps; 4x96
   gives 7.5s contended but drops the public site to 454 rps, so the default
   takes the middle and an operator who would rather have the dashboard
   raises the variable.

**And the admin dashboard's own cost was measured rather than refactored.**
The obvious suspects are its ~82 queries and the 34 screens it renders at
once, and the second one is not where the time goes -- rendering only the
active screen was measured at 1.7MB down to 135KB for 0.4s of wall clock.
Clustered, it is 3.7s idle and 9-11s under a load no clinic this size will
see, for a screen a handful of admins open. So the "every screen stays
mounted" design stays, and the answer to a slow dashboard is another worker
rather than a rewrite. Revisit if the number of concurrent admins grows, not
before.

## Schema conventions

- `supabase/schema.sql` is the single source of truth and is re-runnable:
  guarded with `if not exists` / `or replace`, with later sections adding
  columns to earlier tables. Add changes at the **end** of the file in that
  same guarded style; do not rewrite earlier statements. Two guards are easy
  to forget and both broke a re-run in practice: a policy needs
  `drop policy if exists` under **its own** name (not just the name it
  replaces), and `alter publication ... add table` needs the
  `do $$ ... exception when duplicate_object then null; end $$` wrapper every
  other publication line in the file uses. Re-apply the file twice after
  touching it - the schema-apply workflow runs it on every push to `main`,
  which is the **live** branch. A schema change merged to `staging`, the
  default branch, reaches staging's own database only when a person applies
  it; see STAGING.md.
- **A new Supabase project may hold no table privileges for `anon`,
  `authenticated` or `service_role`, and `schema.sql` does not grant any.**
  It relies on the platform's default privileges, which are absent when the
  project was created with automatic Data API table exposure off (or when the
  tables were created by a role that did not receive the defaults). RLS
  policies do nothing without the underlying privilege, so the symptom is not
  an empty result but `42501: permission denied for table profiles` on every
  signed-in read. It reads as a role bug: the proxy treats a failed
  `profiles` read as "not this role", so a correctly promoted admin is
  redirected to `/get-started` and "Go to dashboard" does the same. This
  happened on the first production sign-in. Diagnose it from the SQL editor
  with `begin; set local role authenticated; select set_config('request.jwt.claims',
  '{"sub":"<user id>","role":"authenticated"}', true); select role from
  profiles where id = '<user id>'; rollback;`. Before granting, confirm every
  table has RLS on, since the grants make RLS the only barrier:
  `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`
  must return no rows. Then apply, once per new project:

  ```sql
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to authenticated, service_role;
  grant select on all tables in schema public to anon;
  grant all on all sequences in schema public to authenticated, service_role;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
  alter default privileges in schema public grant select on tables to anon;
  alter default privileges in schema public grant all on sequences to authenticated, service_role;
  ```

  Tables and sequences only: function EXECUTE is deliberately left alone,
  because the schema revokes it from `public`, `anon` and `authenticated`
  and re-granting it wholesale would undo that.
- New columns are migration-dependent - a live database may not have them
  yet. Query such a column in its own isolated call and merge the result in
  (see `src/lib/sessionCode.ts`), so one unknown-column error can't blank
  every field of a shared query.
- Money is integer paise. Times are `timestamptz`. Percentages
  (`revenue_share_percent`) are 0–100.
- **Session credits are a ledger, not a counter.** `session_entitlements`
  is what a patient bought; `session_credit_ledger` is every movement of it,
  append-only. The counts on the entitlement are a *cache* the ledger
  maintains by trigger, and the CHECK on that cache is what makes an
  impossible balance impossible rather than merely unwritten - a ledger row
  that would overdraw fails the constraint and takes its transaction with
  it. Six rules hold this together:
  1. **Every movement goes through an RPC** (`reserve_session_credit`,
     `consume_session_credit`, `release_session_credit`,
     `void_session_credits`, `adjust_session_credits`), called from
     `src/lib/sessionCredits.ts`. They open with `select … for update`,
     which is a real lock - verified with 12 concurrent reserves against one
     credit, of which exactly one won. Never write the ledger directly.
  2. **Idempotency keys are derived from the thing that happened**, never
     random: `reserve:<appointment_id>`, `consume:<appointment_id>`. A
     random key makes every retry look like a new event, which is the bug
     the key exists to prevent. Idempotency is checked *before* availability
     in `reserve_session_credit`, deliberately - checking availability first
     answers "no credits available" for a booking that in fact succeeded.
  3. **The ledger is append-only, enforced by a trigger, not by RLS.** The
     revoke covers a browser session; every route in this app writes with the
     service-role client, which bypasses RLS entirely. For a table whose
     whole value is that it cannot be rewritten, "no route updates it" is
     not the same guarantee as "an update raises".

     **That reasoning applies to every evidence table, and four did not have
     it.** An audit found the gap by simply issuing the UPDATE:
     `admin_activity_log` -- the trail the whole Logs section is built on, the
     record of who impersonated whom, who settled which payout and who cleared
     the log -- accepted a rewrite and changed a row. `payments`,
     `payment_webhook_events` and `session_note_revisions` were the other
     three. Each now permits exactly the one mutation it needs and refuses the
     rest: `admin_activity_log` keeps DELETE (the retention purge is the only
     path a row has ever left by) and never takes an UPDATE;
     `payment_webhook_events` may have `processed_at` and `processing_error`
     set after the work and nothing else, and is never deletable, because the
     row **is** the deduplication; `payments` still makes the created ->
     captured transition, and a captured payment's two Razorpay ids are frozen
     and its row is never deletable, since that is the record money moved;
     `session_note_revisions` takes neither. Verified with
     `scripts/append-only-sql-checks.sql`. A new table whose value is that it
     cannot be rewritten gets its guard in the same change.
  4. **`sessions_granted` and `package_snapshot` are frozen by trigger.**
     A purchase's definition never moves; its balance moves through the
     ledger. Never resolve a purchased entitlement by joining the live
     catalog row - read the snapshot, or an admin re-pricing a package
     silently rewrites what someone already owns.
  5. **A refund voids what is available, never what is consumed.** A
     delivered session stays delivered.
  6. **`admin_adjust` is the only entry type with free-form deltas, and the
     only one requiring a reason** - ten characters minimum, enforced by a
     CHECK so it holds for any caller. It is the override lane behind
     `/api/admin/grant-session-credits`, `reverse-session-credit` and
     `revive-entitlement`: an admin can change any balance, and cannot
     change any history.

  **Which number the app believes is a switch, not a deploy.**
  `site_settings.entitlement_ledger_authoritative` (Settings → Advanced,
  off by default) decides whether a balance shown and offered comes
  from the ledger or from `sessions_used` / `visits_used`. Flipping it is
  reversible in a second, because both are still written either way.

  The flip needed no screen to change. Every surface that shows a balance -
  the patient's widget, the therapist's programme list, both detail modals,
  the admin Purchases table, the bulk scheduler - reads the same
  `session_count` / `sessions_used` shape, so `src/lib/ledgerBalances.ts`
  substitutes `sessions_used` on the row **once, where the row is loaded**
  (`sessions_granted - available`), and every consumer follows. Add a new
  balance surface by loading its rows through that helper, not by reading
  the ledger yourself. It leaves `session_count` alone on purpose, so a
  refunded package still reads "6 sessions" with none pending rather than
  becoming a 1-session package, and it never touches a purchase with no
  entitlement - a database without the backfill behaves exactly as before.

  The flip deliberately does **not** change how a session is *claimed*. The
  counter's compare-and-swap still wins the booking race, with the ledger's
  row lock beside it. Making the ledger the claiming mechanism means
  deleting the counter writes, which is its own change with its own risk.

  **The ledger is written alongside the old counters, and does not yet
  replace them.** All eight statements in `src/` that mutate
  `sessions_used` / `visits_used` now have a mirror call beside them
  (`src/lib/sessionCreditMirror.ts`), and a mirror failure never fails the
  operation it mirrors - the counter is still authoritative, so a logged
  disagreement that reconciliation surfaces beats refusing a booking
  because a shadow ledger was unhappy. Two of the mirrors have no counter
  write to mirror at all, and both are the ledger saying something the
  counters could not: a **refund** never touched the counters (it cancels
  the remaining appointments in place and leaves the counter inflated), and
  an **expiry** left the balance implicit. A **late cancellation** mirrors
  a `consume` rather than nothing - the balance is the same either way, but
  leaving the reserve outstanding would claim a cancelled session is still
  pending. New purchases get their entitlement from
  `ensure_entitlement_for_purchase`, called by both verify routes and by
  cash-on-visit booking, which never becomes `paid` and so reaches neither.

  `verify_entitlement_balances()` reports where the cache, the ledger and
  the legacy counter disagree, on Settings → System Health → Books &
  Sessions Agree. It reports and
  never repairs - a silent auto-fix on a money record is how a discrepancy
  becomes permanent. It has already earned itself twice, catching two
  distinct bugs in the backfill it checks.

- **An invariant the app enforces belongs in the database too.**
  `sessions_used` / `visits_used` were guarded only by application-level
  compare-and-swap - correct, and true only for as long as every writer
  remembers the `.eq()` predicate, and not true at all for a hand-run
  UPDATE in the table editor. Both now carry CHECK constraints. If one
  fails against a live database, that failure is the finding: reconcile the
  rows, don't weaken the check.
- Any new table needs RLS policies written alongside it in the same file.
- **A function is revoked from `public`, `anon` AND `authenticated` - all
  three, every time.** Postgres grants EXECUTE on a new function to
  `PUBLIC`, and Supabase's `pg_default_acl` for `postgres` in schema
  `public` grants it to `anon` and `authenticated` explicitly on top. So
  each of the two obvious short forms is wrong in a different case, and
  both were:
  1. `revoke execute on function f(...) from anon, authenticated` removes a
     grant those roles never held directly and leaves PUBLIC's in place.
     Eleven functions were written that way - `record_payment_capture`
     (mark a booking paid), `grant_session_credits` (mint sessions),
     `adjust_session_credits`, `void_session_credits` and the rest of the
     ledger - and every one of them was callable over PostgREST by anybody
     holding the publishable anon key, no account needed. The statement
     succeeded. The ACL changed. Nothing was protected.
  2. `revoke ... from public` alone is correct on a database where those
     functions predate the default, and wrong on a fresh one: applying
     `schema.sql` to an empty project creates them anew, so they arrive
     carrying explicit `anon=X` and `authenticated=X`, which a revoke
     naming only PUBLIC does not touch. The hole returns on the first
     rebuild, in the file that appears to have fixed it.
  Name all three. Revoking a privilege that was never granted is a no-op,
  so the long form is safe on either shape of database.
  `alter default privileges in schema public revoke execute on functions
  from public/anon/authenticated` is at the end of the file so the next
  function is closed on arrival; a function genuinely meant for a signed-in
  caller then needs an explicit `grant execute ... to authenticated`, which
  is the right way round. `is_admin()` is the one deliberate exception -
  RLS policies invoke it as the querying role, so revoking it breaks all 23
  of them. `npm run lint` fails on a violation; `scripts/check-live-grants.mjs`
  checks the running database, since only that catches a revoke that was
  never applied.
  **And `scripts/check-definer-exposure.mjs` asks the question those two do
  not: which definer functions can a browser actually *call*.** It is run by
  hand against a live project, like `check-live-grants.mjs` beside it, and it
  is the durable half of the RPC review rather than a snapshot of it. The
  answer decides how load-bearing the input validation inside each body is:
  while no argument-taking definer function is reachable by `anon` or
  `authenticated`, every one of them is called by this app's own routes with
  the service-role key, so a missing check inside a body is a bug in a route
  rather than a door for a stranger -- and the moment one *is* reachable, its
  arguments are attacker-controlled and every assumption the body makes about
  them is a hole. Three are deliberately reachable and each carries its reason
  in the script's `ALLOWED` map: `is_admin()` and `is_active_therapist()`,
  which the policies invoke as the querying role, and `rls_auto_enable()`,
  which is Supabase's own event trigger rather than ours. The bar for adding a
  fourth is the one `is_admin()` set -- **no arguments**, so a caller cannot
  steer it, and an answer about nobody but themselves. Its negative control
  was run before it was trusted: granting `execute on check_rate_limit to
  anon` failed it by name, and revoking the grant made it pass again.
  **Reading the bodies behind it turned up no missing guard, and three
  mechanical flags that are all false positives worth not re-raising.**
  `grant_session_credits` and `adjust_session_credits` take no row lock of
  their own because they are thin wrappers over `session_credit_entry`, which
  holds the lock, checks idempotency inside it and leaves the CHECK on the
  cached counts as the final arbiter -- the lock is one level down, not
  absent. `claim_promo_code` and `claim_invite_half` never `raise` because a
  checkout refusal is a **named reason** in the returned jsonb, which is what
  lets the route turn it into a sentence a patient reads; raising there would
  turn every ordinary "this code has expired" into a 500. And
  `purge_expired_temp_passwords` needs neither: it clamps its own argument
  with `greatest(1, coalesce(p_older_than_days, 14))`, so a 0 or a negative
  day count cannot purge a credential issued a second ago.
- **A therapist's clinical reads follow delivered care, and stop when the
  account does.** Four policies decide whether a therapist may read a
  patient's health profile, Pain Map exams, uploaded reports and session
  notes, and all four asked only whether they had an appointment with that
  patient. Two things came out of reading them together.
  **The retention rule is good, and it was nobody's stated intention.**
  Access is keyed on being named on one of that patient's appointments, and a
  **completed session keeps whoever ran it** -- neither `update-appointment`
  nor `reassign-package-therapist` will move one. So a clinician who actually
  treated somebody keeps access after the patient moves to a colleague, which
  is the decision: in a clinic this size the person who gave the care has to
  be able to answer for it, and a cut-off creates the worse failure. The
  mirror keeps it honest rather than merely permissive -- a therapist whose
  only link was a *future* session that was reassigned away reads nothing,
  because they never treated this patient.
  **And a suspended therapist now stops reading, at the row.** Those policies
  never asked whether the account is still allowed to be a therapist here.
  That is the same shape as the patient case documented above, but the
  asymmetry matters: a suspended patient's live token reads their own rows
  for one token lifetime, where a suspended therapist was reading *other
  people's medical records* on the same terms.
  `is_active_therapist()` is the counterpart of `is_admin()` and is exempted
  from the revoke rule for the same reason -- the policies invoke it as the
  querying role. It checks `approved` as well as `active`, unlike
  `is_admin()`: an admin is promoted by hand so gating on approval would lock
  out the people it protects, and a therapist still in the signup queue has
  no business reading a chart. A fifth clinical table calls it rather than
  inlining the check.
  `session_notes_select_clinician` also carried a hand-written copy of
  `is_admin()` -- the drift the eighteen-policy sweep corrected everywhere
  else, on the clinical table an admin is least likely to look at, and the
  copy does not check `active`.
  **What was actually reported, though, was that the policy is unclear** --
  and it was: the rule lived in four policies and one helper and was stated
  on no screen at all, so "who can see this patient's record" was
  unanswerable. `src/lib/clinicalAccess.ts` plus **Who can see this record**
  on the admin's patient page answers it, listing every clinician, why, and
  when they last saw the patient. A suspended therapist is listed and
  **marked**, never dropped: omitting them would make a suspension look like
  a deletion on the one screen whose job is to say who has a relationship
  with this record.
  Both halves are asserted -- a tightening that refused everybody would pass
  a file testing only the refusals. `scripts/authorization-checks.mjs`
  section 7 runs all four cases against a live database, and
  `scripts/clinical-access-sql-checks.sql` guards the policy shape with its
  own negative control.
- **Every admin policy calls `is_admin()`; none inlines it.** Eighteen
  policies carried a hand-written copy of the same `exists (select 1 from
  profiles where id = auth.uid() and role = 'admin')` instead of the call.
  That cost nothing while the copies agreed with the function - and the
  moment `is_admin()` learned to refuse a suspended admin, the eighteen did
  not. The tables involved were the worst possible list: the audit log, the
  impersonation record, the flagged-message and contact-reveal evidence
  trails, session notes, the risk queue and all four finance tables. A
  suspended admin was refused `appointments` and still read
  `admin_activity_log` with the same token. Two policies are compound
  ("the treating therapist OR an admin") and only the admin disjunct is the
  call. A new admin policy uses the function.
- **Suspending an account ends its sessions.** `profiles.active` is read by
  `src/proxy.ts` and `requireActiveProfile`, and both are this application;
  a session cookie reaches PostgREST without passing either, and Supabase
  keeps rotating that account's refresh token, so a flipped column alone had
  no end date on it. Two halves, both required: `is_admin()` refuses a
  suspended admin at the policy layer, and all four `set-*-active` routes
  call `revokeAllSessions()` (`src/lib/supabase/revokeSessions.ts`) over
  `revoke_user_sessions(uuid)`. It is a database function rather than
  `auth.admin.signOut`, which takes the suspended person's own JWT - which
  an admin route does not have - and the GoTrue admin endpoints that would
  do it by id answer 404 on this project's version; both were tested before
  this shape was settled on. It stops renewal rather than killing a token
  mid-flight, so remaining exposure is one JWT lifetime. **What refuses them
  during that window differs by role, and this sentence used to overstate
  it.** For an *admin* the policy layer genuinely does: `is_admin()` checks
  `active`, so all eighteen admin policies refuse. For a patient, therapist
  or hospital it does not -- their `*_select_own` policies key on
  `auth.uid()` alone, so a suspended account's live token still reads its
  **own** rows straight from PostgREST until it expires. The app is the gate
  there (`src/proxy.ts` for navigation, `getProfileStanding` /
  `requireActiveProfile` in every route), and the reach is bounded to their
  own data for at most one token lifetime -- but it is the app and not the
  database. `npm run check:authorization` asserts the admin half and reports
  the other, rather than claiming a guarantee that is not there. A
  failed revoke never un-suspends the account - it returns a warning the
  route passes on, because "the door is locked but they are still inside"
  is worth saying out loud.
- A change to `schema.sql` only reaches a database once it's applied
  - either by hand with `node scripts/run-schema.mjs`, or automatically via
  `.github/workflows/schema-apply.yml`, which runs that same script against
  Supabase on every push to `main` that touches `supabase/schema.sql` (it
  runs in the `Production` GitHub environment and reads
  `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL` from there, not
  from repository secrets). Merging a schema change without either path
  running leaves the DB's policies out of sync with code that assumes them -
  the app can look fixed in review and still fail in production the same way.
  **`main` only, and deliberately so now that `staging` is the default
  branch**: those secrets point at the live project, so widening the trigger
  would apply a staging merge's schema to the production database. Staging's
  database is therefore applied **by hand**, and that step belongs *before*
  the app is exercised there -- the code assumes policies and functions that
  are otherwise simply absent, which fails in ways that read as code bugs.
  STAGING.md holds the whole model.

- **No cron or background worker exists in this deployment.** Anything that
  needs to happen "when time passes" (a package purchase's `status` moving
  from `active` to `expired` past `expires_at`) runs as a lazy, idempotent
  sweep at the top of a relevant page's render instead of on a schedule -
  see `src/lib/expirePackagePurchases.ts`, called from both the admin and
  patient dashboard pages before their own reads. Follow this pattern
  rather than reaching for a cron job or a queue. Home-visit purchases get
  the identical treatment via `src/lib/expireHomeVisitPurchases.ts`, and
  failed Meet syncs via `src/lib/retryDueMeetSyncs.ts`. A sweep that calls an
  external API is the one that needs limits: bound it by wall-clock time,
  rows per sweep, and attempts per row, or a permanently failing row becomes
  an unbounded retry loop attached to every page render.
- **Package (and home-visit package) detail is viewer-scoped, not
  role-branched.** `/api/packages/purchase-detail` and
  `/api/home-visit/purchase-detail` both query the purchases table with the
  caller's own RLS-scoped client rather than checking role: the
  `*_purchases_select_*` policies already encode exactly who may see a given
  purchase, so a row coming back at all *is* the authorization check. Only
  the one cross-role name lookup RLS can't provide (the other party's name)
  uses the admin client. Don't add a manual ownership branch here or you'll
  duplicate what the policies already guarantee.
- **Business math lives in dependency-free `src/lib/` modules** (`pricing`,
  `adminMetrics`, `therapistEarnings`, `therapistPayouts`, `ratingAggregate`,
  `packageProgress`, `homeVisitPricing`, `homeVisitProgress`,
  `therapistCashLedger`, `healthProfileSummary`) so it can be reasoned about
  without rendering. Keep new math there rather than inside components.
- **Isolated is not the same as sequential.** The admin dashboard keeps its
  migration-dependent reads out of the big `Promise.all` so one
  unknown-column error costs its own panel rather than the dashboard -- and
  eleven of them had become a chain of `await`s, one round trip after
  another, paid on page load *and* on every `router.refresh()` any admin
  button fires. They are one second `Promise.all` now, each entry still
  swallowing its own error (through a `guard()` wrapper or its own helper),
  so the isolation is unchanged and only the waiting is gone. Add a new
  migration-dependent read to that batch rather than as another `await`
  below it.
  **The same rule caught the page a second time, three blocks lower, and
  those blocks were the whole of its perceived slowness.** Measured against a
  production build with a Master Admin's own session: the response took 7.9s,
  and of that the 56 queries in the two batches above cost **1.2s**. The
  other 5.4s was seventeen `await`s in a row between them and the return --
  the Risk block (7 round trips), the Recommendations queue (7), and the
  authoring panel with `loadRecommendablePackages` inside it (5+3). At ~320ms
  a round trip that is the entire gap, and the arithmetic matched the trace
  almost exactly. None of the three chains is as deep as it is long: the risk
  reads need two waves, the queue's three need one, and the whole authoring
  chain needs nothing from either of the others. So the reads inside each
  block go together, and the authoring chain -- the longest -- is **started
  above the risk block and awaited where it is read**, which is what lets the
  other two run inside its latency rather than after it. 7.9s to 3.5s, with
  the rendered markup byte-for-byte identical (555KB, 9,925 lines, diffed
  both ways) -- this changes only what waits for what.
  Three details are load-bearing. A promise started early and awaited later
  has a window with **no handler attached**, so `authoringDataPromise` takes a
  no-op `.catch()` the moment it is created: without it a rejection during the
  blocks below is reported as an unhandled rejection, which some runtimes
  treat as fatal, and the `await` still throws the real error exactly as an
  inline read did. `canSeeCarePlans` is hoisted above the risk block because
  that chain needs it -- it is `scopeCanOpen(viewerScope, "sessions")` and
  depends on nothing else. And every read keeps its **own** guard and its own
  empty fallback inside the batch (`Promise.resolve({ data: [] })` for a
  skipped one, a `soften()` wrapper where a `try`/`catch` used to sit), so a
  new column that a live database has not got still costs one panel rather
  than the screen.
  **What this is not.** The dashboard's 1.7MB of HTML is 34 screens rendered
  at once, and that is *not* where the time goes: rendering only the active
  screen was measured too, and it cut the response to 135KB while moving the
  wall-clock by 0.4s. Bytes and latency are separate problems here, and the
  "every screen stays mounted" design costs the second one almost nothing.

---

## Indexes

**A foreign key is not indexed automatically.** Postgres creates an index for
a PRIMARY KEY and for a UNIQUE constraint, and for nothing else. 93 FK
columns in `schema.sql` had none. That costs twice: a filter or join on the
column is a sequential scan, and deleting a *parent* row makes Postgres scan
the **child** table to enforce the constraint, once per parent row — which is
what `scripts/clean-e2e-residue.mjs` pays on every run against the `restrict`
relationships.

Three rules when adding one:

- **Earn it from a real call site or a real policy.** An index is another
  structure every INSERT and UPDATE maintains, and `appointments` is both the
  most-read table here (189 call sites) and a write-heavy one. The set added
  in the index block at the end of `schema.sql` each matches an
  `.eq()`/`.in()`/`.order()` combination in `src/` or an `exists (...)` inside
  an RLS policy. Nothing was added speculatively.
- **A composite index serves its own prefix.** `(patient_id, status)` answers
  a `patient_id`-only filter as well as a single-column index does, so prefer
  the pair over adding a second index. The pre-existing single-column indexes
  on those leading columns are now redundant for reads and were left in place
  on purpose: dropping an index is the one schema change a re-run cannot undo.
- **Check for a table-level UNIQUE before calling a FK uncovered.**
  `therapist_availability_template.therapist_id` looks like a gap in any
  FK audit and is not — `unique (therapist_id, day_of_week, hour)` already
  builds an index led by that column.

`create index concurrently` cannot run inside a transaction block, which is
how this file is applied, so the entries here are plain `create index if not
exists`. On a table with real volume that takes a lock that blocks writes for
the duration. **After launch, add the index by hand with `concurrently`
first**; this file then catches up as a no-op through its `if not exists`.

## RLS predicates: always `(select auth.uid())`

Never write `auth.uid()` bare in a policy. Write `(select auth.uid())`.

Postgres marks `auth.uid()` volatile — it reads the request JWT out of a GUC
— so a bare call is re-evaluated **once per candidate row**. Wrapped in a
scalar subquery the planner hoists it into an InitPlan and computes it once
for the whole statement. The predicate is identical; only the number of calls
changes. Inside an `exists (...)` subquery it is worse again: the per-row call
sits in the inner scan too, so the clinical-access policies were paying it
across the product of two row counts.

`npm run lint` fails on a bare one (`scripts/check-rls-initplan.mjs`). The
check only looks at the **live** definition of each policy: this file is
re-runnable and later sections supersede earlier ones, so an earlier
declaration is dead text, and a policy whose last mention is a `drop policy
if exists` with no later `create` has been withdrawn deliberately. Four
policies are in that last category — `appointments_insert_own`,
`b2b_leads_insert_public`, `pain_assessments_insert_gated` and
`patient_referrals_insert_own`. **Do not re-create them to make them faster**:
each had its client-side INSERT withdrawn on purpose, and those writes now go
through service-role routes.

## PostgREST's row cap applies to every bare `.select()`

Covered above under the clients, and worth repeating as a rule because it has
now been found three times: a `.select()` with no `.range()` stops at 1,000
rows and answers **200**, with nothing to distinguish it from a table that
holds exactly a thousand rows. Any read that **sums money, counts for a
decision, or reconciles two totals** goes through `readAllRows` and acts on
its `truncated` flag — a partial total is not a smaller total, it is an
unknown one, and the caller must say so rather than publish it.
