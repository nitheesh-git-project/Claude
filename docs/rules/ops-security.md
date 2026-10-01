# Roles, security and operations

The two access flags and where they are enforced, rate limiting, impersonation, keeping the platform's conversations, risk signals, the data reset, and the gotchas.

**Mostly lives in:** src/proxy.ts · src/lib/supabase/requireAdmin.ts · rateLimit.ts · impersonation.ts · contactLeakScan.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

## Roles and access

`profiles.role` is one of `patient`, `therapist`, `hospital`, `admin`.
Patients and therapists self-register and wait for approval; hospitals are
provisioned by the admin; admins are promoted by hand in Supabase.

**Email confirmation is off, deliberately, and the app assumes it.** The
Supabase project keeps *Confirm email* disabled, so `signUp` returns a
session immediately and the admin's approval is the only gate a new account
waits on. Never add a "check your email" step back into a sign-up path: a
signup with no session is a misconfigured project, and the four sign-up
call sites (`PatientAuthCard`, `TherapistAuthCard`, `BookingWizard`,
`HomeVisitBookingWizard`) all report it as a failure rather than an
instruction. `e2e/patient-registration.spec.ts` is what catches the setting
being turned back on.

Two flags gate everything: `profiles.approved` and `profiles.active`.
They are enforced in **two** places and both must stay in place:

1. `src/proxy.ts` → `src/lib/supabase/proxy.ts` for dashboard navigation.
2. `src/lib/supabase/requireActiveProfile.ts` inside self-service API routes,
   because a valid session cookie can call the API directly around the UI.

An audit found eight routes with only the first - `acknowledge-payout-request`,
`withdraw-suggestion`, `hospital/withdraw-referral`, `home-visit/verify`,
`medical-documents/delete`, `dismiss-onboarding`, `log-payment-failure` and
`clear-temp-password`. All eight are ownership-scoped, so the reach was "a
suspended account keeps acting as itself" rather than anything cross-account,
but that is exactly what this rule exists to stop and the routes read as
though they had it. They call the helper now. Use the helper rather than an
inline `profile.active === false` even when the route already loads the row
(`reveal-contact` does, correctly, and is why the other eight were missed):
a grep for the helper name is how the next audit finds the gap.

Admin routes go through `src/lib/supabase/requireAdmin.ts`. Never trust a
role, an id, or an amount sent from the client - re-derive it server-side.

**A body is parsed through `parseJsonBody`, never `await request.json()`.**
`request.json()` throws on a malformed or absent body and nothing catches it,
so the caller gets a 500 where the honest answer is a 400 -- the request was
theirs to get right. A sweep of every POST handler found 45 still parsing
directly, among them `/api/razorpay/create-order`, `/api/razorpay/verify` and
the one public door in the list, `/api/patient/register-via-referral`. The
helper also refuses a body that is valid JSON but not an object (`null`, an
array, a bare string), because every call site destructures the result and
those arrive as an uncaught TypeError further down instead. Type the generic
with the shape the route expects rather than leaving the fields implicitly
`any`: doing that is what showed the admin forms post `""` for a blank number
box, so `displayOrder` and `rating` are `number | string` and the routes were
right to compare against `""`. Where a route already narrows a value itself
(`Array.isArray`, a `typeof` check, a literal comparison), the field is
`unknown` -- typing it concretely would claim a guarantee the request does not
carry.

**A check that could not be run is not a check that came back negative.**
`getAdminUser` collapsed three different outcomes into `null`, and the routes
turned that into a flat 403: no session, a failed read, and genuinely not
allowed all said "Forbidden". Two of those are not refusals. The one admins
actually met is the **session refresh race** - this dashboard fires many
requests at once, Supabase rotates refresh tokens, and the request carrying
one another has just rotated comes back with no user - so a Master Admin was
intermittently told they were not allowed to use a control they use every
day. `getAdminContextResult()` keeps the reason: `unauthenticated` (401,
retryable), `unavailable` (the profile read errored - anything but
`PGRST116`, which is a real "no such row"; 503, retryable), `forbidden`
(403, and deliberately still opaque so a limited admin cannot map what
exists beyond their access). `getAdminUser` and `getAdminContext` keep their
`null` shape, so every route built on them is unchanged; a route that can
act on the difference takes the result version instead. A client may retry a
401 or a 503 **once** - both are answered before anything is written, so
there is nothing to duplicate - and must not retry anything else.

Admins additionally carry a scope (`profiles.admin_scope`: `full`,
`operations`, `finance`, `clinical` - see `src/lib/adminScope.ts`), which
decides which dashboard sections they can open **and at what level**. A
`(scope, section)` pair is `none`, `view` or `manage`, and the middle value
is the point: a desk often needs to read something it must never change.
There is deliberately no "write only" - a dashboard cannot let somebody
change a row they are not allowed to see, so the third box a permissions
matrix usually draws is one this product has no honest meaning for.
**`requireAdminScope(section)` asks for `manage`**, which is what makes
`view` real rather than a label: every route guarded by it is a POST that
changes something, so a section granted at `view` is read-only at all **119** of
them without one being edited (`grep -rl requireAdminScope src/app/api
--include=route.ts | wc -l` -- 119 of the 122 admin routes, the three
exceptions being reads: `export-pdf` and the two purchase-detail routes), and the level cannot be widened by a screen
forgetting to hide a button. `scopeCanOpen` (view or manage) decides what
renders; `scopeCanManage` decides what a control may do. One grant is
`view` today - **finance reads Sessions** - because the question finance
actually asks ("what was this ₹1,200 for?") was answerable only by asking
somebody else, while handing finance the section outright would let the
person reconciling the books cancel the sessions they are reconciling.
**Every** admin route guards
with `requireAdminScope(section)`, not `getAdminUser()`; the sidebar hiding a
section is presentation only, since a session cookie can call any route
directly. The section is chosen by the capability, not by where the button
happens to sit - a refund is `money` even though its button lives on a
Catalog screen. And a guarded route needs the UI to match: a control an
admin's scope cannot call must not render, or they get a 403 with nothing
to explain it. `ProfileSessionList`, `SessionDetailDrawer`, the two
purchase detail modals and the Partners screen's revenue-share editor and
its two share figures take `canSeeMoney` / `canManageSessions` for exactly
that reason -- Partners sits on People, which every scope opens, while
`update-hospital-revenue-share` is a money route.

**Every scope opens on its own dashboard, and one module decides all four.**
`src/lib/adminHome.ts` returns the greeting, the four figures, the quick
actions, the queue order and the access note for a given scope, and the
dashboard page renders what it returns. Four scopes on one Today screen went
wrong in three ways, and all three are the kind that look like a working
screen:
1. **A figure that disagrees with the list under it.** "Needs a person"
   summed every queue while the queue list beside it was already filtered to
   what the viewer could open, so a clinical admin read 23 over a list of
   four. `visibleQueueTotal()` counts the same rows the list renders, and
   the strip reads that. Same rule as the `?view=` presets: a count links to
   -- and agrees with -- the rows it counted.
2. **A link the viewer cannot follow.** The quick actions were hardcoded at
   Sessions and Money for everybody, and `findTab` falls back to the first
   section a scope *can* open -- so a finance admin's "All sessions" landed
   back on Today, silently. Every href this module produces is built through
   `scopeCanOpen`, and an action for an unreachable section is **dropped**
   rather than written carefully, so a future change to the scope table
   breaks the list rather than the admin. The dashboard's global search is
   filtered the same way: a purchase code that opens Today is a code the
   admin is told does not exist.
3. **A role reading a different role's questions first.** Emphasis is
   scope-shaped: operations leads with unassigned sessions, finance with
   what is owed, clinical with the recommendation queue. A money figure is
   not merely unlinked for a scope that cannot open Money -- the page does
   not compute it.
Ordering the queues is emphasis, never permission: `orderQueueGroups()`
moves a scope's own domains to the top and **removes nothing**, because what
a scope may work is the routes' decision and a UI that hid a reachable queue
would be a second permission model to disagree with the first.
**Activity is the one exception, and it is deliberate.** A queue is work
waiting on somebody, so hiding one would hide their job; a log is a record of
what other people did, and the clinic's decision is that a desk reads its own.
`src/lib/activityScope.ts` holds it: an entry is visible to a limited scope
only when the action's **domain** is a section that desk can work *and* the
**actor** sits at that desk. A Master Admin is unfiltered. The domain map is
taken from the `requireAdminScope("...")` each action's own route guards with,
so the feed cannot offer a row whose screen the reader is refused at, and
`activityScope.test.ts` fails when an action in the audit union has no entry.
The actor half has a cost worth knowing: in a small clinic the Master Admin
does most of the work, so these feeds run sparse -- which is why a scoped
reader is told the list is their desk's rather than being shown an empty
screen that reads as "nothing happened". What a queue
*count* reads, though, is `manage` and not merely open: a queue is a piece of
work, and finance reads Sessions without being able to assign one, so an
unassigned session is not waiting on them - counting it there would put a
figure on their Today screen that nothing they could do would ever bring
down. `visibleQueueTotal`, the queue list and `reachableActions` all take the
workable sections, so the three agree. **Every dashboard names itself**, in the sidebar brand (above "Admin Panel")
and again as the eyebrow over the section heading -- `Master Admin`,
`Operations`, `Finance`, `Clinical`, from `ADMIN_SCOPE_LABELS`. Twice
because the sidebar collapses to icons and is a closed drawer on a phone,
while the header is on every screen at every width. Four dashboards that all
said "Admin Panel" and differed only in which sidebar entries were missing
made an admin infer which one they were on from an absence. That label set
is **one set, doing three jobs** -- the entries in User Access's Account
type picker, the access level on an existing admin's row, and the name on
the dashboard -- which is why `full` reads "Master Admin"
rather than "Full access": as a permission both work, but only one is the
name of a desk somebody sits at, and every user-facing string that used to
say "full-access admin" says Master Admin now (the QA plan quotes those
verbatim, so it moved in the same change). **Creating one of those admins is one dropdown.** User Access's Account
type picker lists all six in two groups -- Clinic (Patient, Therapist) and
Back office (the four scope labels) -- rather than an "Admin" entry that
reveals a second Access level select once chosen. Hiring somebody into
Operations meant picking a word nobody uses and then finding a control that
was not on screen a moment earlier, in the one place where the four desks
are otherwise named consistently. The option value carries both halves
(`admin:operations`) because the route still takes a role and a scope: one
control over two fields, never a new concept in the database, and the
full-only check in `create-account` is what actually stops a limited scope
minting an admin -- the group being absent from the picker is presentation.
A limited scope additionally gets
an access note (`AdminAccessCard`) naming which sections its name comes to
-- the sections are correctly hidden already, and this is the sentence
saying they were hidden on purpose. The note carries no scope name of its
own: the brand and the header are both on that screen already. Add a screen to a scope's landing by editing that
module, not the page; `src/lib/adminHome.test.ts` asserts the two invariants
above over all four scopes.

`getAdminUser()` and the proxy's admin branch both refuse a suspended admin
(`profiles.active`). They deliberately do **not** check `approved`: an admin
is promoted by hand rather than through the signup queue, so gating on it
would lock out the people it protects. Only a `full` admin can change
scopes or mint another admin, nobody can change their own, and the last
`full` admin cannot be narrowed - otherwise a single mis-click locks
everyone out permanently.

Every mutating admin route records what happened via
`recordAdminActivity()` (`src/lib/adminActivityLog.ts`), and every action in
the `AdminActivityAction` union has a caller - that used to be true of only
16 of them, which left the largest money move in the app (`payout.settle`)
unattributed. Adding an action without a caller, or a mutating route without
a call, puts the log back where it was. A QA sweep found a quarter of them writing nothing -
including the route that changes a patient's sign-in email - so the rule is
now checked by counting rather than trusted: every admin route that inserts,
updates or deletes has a call, and the three that do not (`export-pdf` and
the two purchase-detail routes) are reads. A generated password never goes in
`details`: the log is readable by every admin, so who reset what and when is
the part with audit value. The call goes **after** the route's CAS claim,
so the log cannot record a settlement or cancellation that lost its race. It is best-effort
and never throws: an audit write failing must not block the action it
describes, same posture as the Meet-sync rule below. `admin_activity_log`
has a select policy and deliberately no insert policy, so the service-role
client is the only writer and the log is append-only from any session.

- **Rate limiting is Postgres, not Redis, and it fails open.** 173 route
  handlers had nothing throttled. `src/lib/rateLimit.ts` holds the named
  limits and the pure judgements (which caller a request counts against, how
  long they are held off, what they are told); `rateLimitServer.ts` is the
  one enforcement call; `check_rate_limit()` in `schema.sql` is the counter.
  Five things decide the shape:
  1. **The database is the store**, because this deployment has no worker and
     no Redis, and an in-memory counter resets on every cold start and
     disagrees between concurrent serverless instances -- which is the same as
     not having one. Adding Upstash would mean a dependency, an account and
     two more secrets before a single request could be refused.
  2. **A fixed window derived from the clock, with no expiry column.** Same
     reason a pending session suggestion writes no "expired" status: a row
     recording the passage of time needs a sweep. A counter for a window that
     has passed is never read again, and is deleted by the next call for its
     own bucket -- that per-bucket delete is the whole of the cleanup and is
     what keeps the table at one row per *active* bucket.
  2b. **It is counted AFTER the request's shape is checked, not before.**
     This reverses where a limiter usually goes, and the reason is that the
     limiter is the expensive half: it costs a database round trip where the
     validation above it is a trim and a regex. Counting first meant every
     malformed request bought a write -- so the app absorbed junk *worse*
     than validating first does -- and it meant a person correcting a phone
     number spent an allowance meant for abuse, then met a refusal worded for
     somebody who had already succeeded. Nothing is read or written before the
     count either way, so a refusal still costs the caller nothing.
  3. **The count is an insert-on-conflict, not a read then a write.** The
     unique index serialises two simultaneous calls, so a cap of 5 means 5
     while five requests are in flight -- the same reasoning as
     `claim_promo_code` taking a row lock. It counts the hit even when it
     refuses it, or a caller who keeps trying holds their own window open.
  4. **It fails open.** A limiter whose own query fails and then refuses the
     request has turned a blip into a checkout outage, which is worse than
     the burst it would have stopped -- the direction `contact_scan_mode`
     fails, and the opposite of `contact_masking_enabled`, because the safe
     answer differs by what is at stake. Logged, never silent. **No
     identifier is the same case**: with neither `x-real-ip` nor
     `x-forwarded-for` (local dev, or any host that does not set them) the
     request is allowed rather than filed under an invented key, which would
     put every visitor in one bucket and let the first thirty lock out the
     thirty-first.
  5. **Keyed on the account where there is one.** An IP can be rotated and a
     user id cannot, so the checkout limit sits *below* `auth.getUser()` and
     passes `user.id`, falling back to the IP for the anonymous quote and
     promo preview that `checkoutQuote` deliberately answers. `x-real-ip` is
     preferred over `x-forwarded-for`, and where it falls back to the
     forwarded header it reads the list from the **right**. A proxy
     *appends* the address it saw, so the leftmost entry is whatever the
     original caller claimed and the rightmost is the only one a trusted hop
     actually observed. This used to take the leftmost -- its own comment
     said why that was unsafe and then did it anyway as the fallback -- so
     on a host that does not set `x-real-ip`, which is precisely the case
     the Public doors check exists to detect, every request was keyed on a
     value the caller chose, each one got a fresh allowance, and every
     public cap was off while appearing to work. How many entries from the
     right to trust is the one thing only the operator knows, so
     `RATE_LIMIT_TRUSTED_PROXY_HOPS` is that number, defaulting to 0 ("the
     last hop is the one I trust") and read **per call** rather than at
     module load -- this module is bundled per entry in the App Router, the
     same reason the identifier stats hang off `globalThis`, so a value
     captured at load in one copy is not the value another copy saw. Wrong
     upward puts several visitors in one bucket, which Public doors reports;
     wrong downward is what this removed, and no setting can reintroduce it,
     since the value is clamped so it cannot walk past the start of the list
     into caller-supplied territory.
  6. **A 429 is not a "no".** This is the rule in `CLAUDE.md` --
     *a check that could not be run is not a check that came back negative* --
     and adding the limiter reintroduced it one layer up, in the two callers
     whose success payload is a negative-capable boolean. `InviteRegisterCard`
     read `valid` off a 429 and told a referred patient holding a good
     registration link that it had **expired**, sending them to ring the
     hospital; `CarePlanOfferCard` read `serviceable` off one and told a
     patient the clinic does **not visit their address**, disabling the pay
     button on a programme their own clinician had recommended. Both now
     resolve three or four outcomes rather than a boolean, gate on `res.ok`
     before reading a field, and on "we could not ask" say exactly that. A
     route whose 200 body carries a boolean cannot be consumed without
     checking the status first -- and the honest state is a third value, not
     a falsy one.
  A new limit is an entry in `RATE_LIMITS` with its own scope -- never a
  number inlined at a route, and never a per-route limit, since the question
  is what is being protected rather than what one handler can take. **One
  scope per flow**, too: `areaLookup` and `referralCodeLookup` were a single
  `publicLookup`, which let a partner hospital checking codes spend the
  allowance a patient needed to find out whether we visit their street.
  Its message carries **no numbers** (the cap and window are configuration,
  and `rateLimit.test.ts` fails a digit) and **no blame** -- a limit is
  reached by a shared office address, a connection retrying or somebody
  correcting a form far more often than by anybody doing anything wrong, and
  "Too many attempts" reads as an accusation to all three. It also says only
  *what happened*: the concrete wait is composed by the caller from
  `retryAfterSeconds` through `rateLimitNotice()`, which is the half that can
  be specific because it is measured. A message that also said "please wait
  and try again" produced "…and try again. You can try again in about 9
  minutes."
  **A public write needs a route to put a limit in.** The Hospitals page
  inserted straight into `b2b_leads` from the browser under
  `for insert with check (true)`, so it had no server-side door to limit, no
  validation beyond its own JavaScript, and nothing bounding a table nothing
  sweeps. `/api/hospitals/inquiry` is that door and the policy and grant are
  dropped at the end of `schema.sql` -- the same move
  `appointments_insert_own` got. Sign-up and sign-in are **not** covered here:
  both call Supabase Auth directly from the browser rather than a route of
  ours, so their limits are the ones set in the Supabase dashboard.
- **A flag is never an accusation, and never carries a penalty.** The
  detectors (`src/lib/riskDetectors.ts`, vocabulary in
  `src/lib/riskSignals.ts`) run as a bounded lazy sweep after the admin
  Today render - `after()`, a wall-clock budget checked between rules, and a
  five-minute minimum interval, because realtime refreshes that page on
  every booking. Nothing they produce suspends an account, holds a payout or
  hides a therapist: acting on a finding means going to the screen that owns
  that action and doing it deliberately, with its own audit row. That
  separation is what makes a heuristic over clinical data safe to run at
  all, and the Risk tab deliberately carries no action buttons.
  `risk_signals.evidence` stores the ids of the rows that fired a rule
  rather than a score, because an admin who can only see a verdict cannot
  disagree with it. A partial unique index gives at most one **open or
  reviewing** signal per `(rule, subject)` - closing one frees the slot, so
  a repeat after a dismissal is raised fresh, which is correct: it is new
  information. `risk_reviews` is append-only by trigger with a ten-character
  minimum note, since "dismissed" with no reason reads the same as "not
  read". Thresholds live in `risk_rules` and are edited on the tab itself.
  Ten rules are seeded, and the three that need a clinic baseline
  (`plan_conversion_low`, `post_consultation_dropout`,
  `pay_later_balance_high`) ship **disabled** - a threshold invented
  before anyone knows the normal rate fires on everyone or on nobody, and
  the first of those is how a queue stops being read.
  **The findings are scoped by desk; the evidence trails are not.**
  `RISK_RULE_DOMAIN` gives each rule the section that can act on it -- a cash
  variance and a session completed with no payment are money questions, a
  contact leak and an early completion are sessions questions -- and a
  limited desk reads and reviews its own. The reasoning the whole queue used
  to be closed for still holds for the two panels it was really about: the
  flagged messages quote what a colleague wrote and the reveal log names
  every patient contact they opened, so those, and the thresholds deciding
  what fires at all, stay Master-Admin-only (`canSeeTrails`). A desk with no
  rule of its own fetches nothing and is told so, rather than being shown a
  locked screen for a queue holding nothing for them.
  `appointments.completed_at` was added for the `early_completion` detector
  and is stamped only by `complete-session` and cleared only by
  `/api/admin/reopen-session`, which also claims the row on
  `status = 'completed'` rather than writing unconditionally -- reopening
  destroys both sides' ratings, so two admins passing the status check
  together must not both do it. Before that a reopened session kept the
  time of the completion that had just been undone, which is a row reading
  `confirmed` with a completion on it and exactly the evidence the detector
  should no longer see. A row closed before that column
  existed carries null and is skipped rather than guessed at.

- **The platform keeps its own conversations, and leaves evidence when it
  doesn't.** Treatment is paid for through this app, so a patient must never
  be asked to pay another way - and a therapist and a patient who have met
  can agree to carry on privately at a lower price, costing the clinic the
  patient, the revenue and any record that the care happened. Two controls,
  both admin switches, neither of them a policy nobody can check:
  1. **Every cross-role free-text write is scanned**
     (`src/lib/contactLeakScan.ts`, applied through
     `src/lib/communicationFlags.ts`): the suggestion note, a care plan's
     `clinical_rationale` and `instructions`, Pain Map exam answers (which
     reach the patient through the export PDF even though the dashboard
     does not render them), and the patient's own booking notes. Two tiers,
     because this text is **clinical** and a scanner that treats digits as
     suspicious fires on every dose and every exercise prescription: a
     `block` hit (UPI handle, payment link, payment app) refuses the write,
     a `flag` hit (phone, email, social handle, bare URL) is delivered and
     recorded. Phone matching is the Indian mobile shape specifically - ten
     digits starting 6-9, optional `0`/`91` - not a loose digit run, which
     flagged order references. The patient direction is `record_only`: a
     patient is not who this exists to catch, and a 400 at the last step of
     checkout costs a real booking. `site_settings.contact_scan_mode`
     (`off` / `flag_only` / `flag_and_block`) is read in its own call and
     fails **open**.
  2. **A patient's phone is masked on therapist surfaces and their email is
     not loaded at all** (`src/lib/contactMasking.ts`, masked once in
     `therapistDashboardData.ts` where the rows are loaded, so the
     plaintext number is never in the page). The full number comes one
     session at a time from `/api/therapist/reveal-contact`, allowed inside
     a video session's join window or any time on a home visit's own day,
     never for a cancelled session, and every reveal writes
     `contact_reveal_log`. That log write is **not** best-effort: a reveal
     that could not be recorded is refused, unlike the audit log's posture,
     because a reveal with no trace is the one outcome this route must not
     produce. `site_settings.contact_masking_enabled` is read in its own
     call and fails **closed** - the safe answer to "I don't know" is
     opposite for the two settings, and deliberately so.
  `communication_flags` and `contact_reveal_log` are admin-select-only and
  append-only **by trigger**, not only by RLS: every route here writes with
  the service-role client, which bypasses RLS entirely, so an evidence
  record the evidenced party could edit is not evidence. Adding a new
  free-text field that one role writes and another reads means adding a
  `surface` value and a `guardCommunication` call - the CHECK on that column
  is what stops a new field quietly skipping the scan.

- **Only a patient account can book; one account carries one role.**
  `profiles.id` *is* the auth user's id and `role` is a single column, so a
  therapist/hospital/admin session can never also be the patient a booking is
  for. It used to succeed and produce a session that account could never see
  again (each dashboard lists by its own role's column, and `src/proxy.ts`
  bounces a non-patient off `/patient/dashboard`) after money had moved. Both
  wizards render `src/components/booking/WrongAccountForBooking.tsx` instead
  of the form, routing each role to what is theirs: hospitals refer, admins
  use `/api/admin/create-booking`, and a clinician wanting therapy signs out
  and uses a separate patient account. Enforced in three places, all of which
  must stay: the wizards, `isPatientProfile()` in the four purchase routes,
  and `isPatientProfile()` in `/api/appointments/create`. That last one used
  to be a `role = 'patient'` clause on `appointments_insert_own`, back when
  the wizard inserted the row itself; the policy is dropped now and the
  check moved with the insert. Don't add a fifth booking entry point without
  all three.
  **The rule is wider than booking: a patient-dashboard route answers a
  patient.** An audit found three that did not check --
  `/api/patient/dismiss-onboarding`, `previous-therapists` and
  `condition-profile/export` -- each answering a therapist or hospital
  session with a 200. All three act on the caller's **own** row, so nothing
  cross-account leaked, and that is exactly why it survived: the reach was
  "the wrong role got an empty answer" rather than anything alarming. The
  export was the sharpest, handing a non-patient a typeset PDF of an empty
  health record named after them. They call `isPatientProfile` now.
  `previous-therapists` had no `active` check either, which is the same gap
  the eight-route sweep closed elsewhere -- a grep for the helper name is how
  the next audit finds the next one.

- **An admin can sign in as somebody, and that is a session swap rather than
  a preview.** A Master Admin opens a patient's, therapist's or partner hospital's
  dashboard -- the first two from their profile page, a hospital from its card
  on People -> Partners, which is where a hospital's record lives -- and the
  browser genuinely becomes that account: same
  routes, same data, same controls, every write real. It exists because "the
  app is broken for me" is unanswerable from the back office, which shows an
  admin's view of a patient rather than the patient's own.
  It is the most dangerous capability in this codebase, so the rules live in
  `src/lib/impersonation.ts` -- dependency-free and unit-tested rather than
  only clicked -- and there are five:
  1. **`full` scope only, checked directly.** Not
     `requireAdminScope("people")`: a section scope would hand this to
     whoever can edit a phone number. Never another admin (that is one admin
     using another's authority, and an admin in trouble can be asked what
     they see), never a suspended account, never yourself.
  2. **A real reason, ten characters** -- the floor an admin credit
     adjustment uses -- stored on `admin_impersonation_sessions`, which is
     append-only by trigger apart from being closed once, so the admin it
     names cannot rewrite it. **The row is written before the swap**, so a
     session with no record behind it cannot exist; a failed insert refuses
     the whole thing, the same posture as `/api/therapist/reveal-contact`.
  3. **Everything done during the window is written as that user.** No column
     on `appointments` -- or anywhere else -- can say an admin was at the
     keyboard, so that row's `started_at`/`ended_at` window is the only thing
     a later reader can intersect an action against. That is a real cost of
     the swap, accepted deliberately: a read-only mirror cannot reproduce a
     bug that only appears on submit.
  4. **It expires, and the proxy is what ends it.** The marker cookie and the
     Supabase session cookies are separate things, so letting the marker
     lapse on its own max-age would drop the banner while the swap ran on
     underneath it. `updateSession` checks the window on every dashboard
     request and signs out past it -- a forgotten tab is an open window into
     a health record, and the safe direction for one is closed.
  5. **The banner is the only thing that differs from what they see**, so it
     sits above every dashboard screen (`ImpersonationGate`, a layout on each
     of the three trees -- never the root layout, which is shared with the
     ISR-cached public pages and would be forced dynamic by reading a
     cookie). It names the account, says the actions are real, counts the
     window down and carries Exit.
  The admin's own session is parked in a second httpOnly cookie so Exit puts
  them back; losing it costs a re-login and nothing else, which is the right
  direction for a failure here. `/api/admin/stop-impersonation` is authorized
  by the marker cookie rather than an admin check, deliberately: the caller
  is signed in as the patient at that point, so `getAdminContext()` would
  refuse the one person entitled to call it.

- **Don't name the back office to anyone outside it.** Non-admin roles are
  already locked out (`src/proxy.ts`, `requireAdmin`, `requireAdminScope`);
  keep it out of what they can *see* too. A signed-in non-admin reaching
  `/admin/dashboard` is redirected to `/get-started`, never to
  `/admin/login`, which would confirm the back office exists and name its
  door. `/admin/login` is `robots: noindex`. And no client component maps
  role to dashboard path: `src/app/dashboard/page.tsx` resolves that
  server-side, so `Navbar` and `WrongAccountForBooking` link to `/dashboard`
  and the admin path never reaches a public bundle. A `hash` param on that
  route becomes a real fragment (the anchor-based shells need it) and is
  pattern-checked, since it is the one input that could otherwise smuggle a
  host into the redirect. Link new "go to my dashboard" affordances at
  `/dashboard` rather than adding a fifth role map. The debug bar is the
  deliberate exception -- it still lists the admin routes, and is switched
  off before release.
  **A response body names the back office too.**
  `/api/admin/stop-impersonation` answered `{"redirectTo":
  "/admin/dashboard"}` to an **anonymous** caller: it runs no admin check by
  design (the caller is signed in as the patient at that point, so
  `getAdminContext()` would refuse the one person entitled to call it), so
  the no-marker branch was reachable by anybody and told them where the back
  office is. Its other exit did the same with `/admin/login` for anyone who
  sent a forged marker, which is trivial since the marker is unsigned JSON.
  Both answer `/dashboard` now unless the caller has been **shown** to be the
  admin -- a restore token that actually exchanged, or a marker matching its
  own `admin_impersonation_sessions` row, which is a row the admin it names
  cannot write. `/dashboard` resolves the role server-side and sends a
  stranger to `/get-started`, which is the whole reason that route exists.
  Check what a route *says* as well as what it lets you do.

## Pre-launch data reset

The debug bar carries a **Reset data** button (`DebugResetButton` ->
`/api/admin/debug-reset` -> `debug_reset_all_data()` in `schema.sql`). It
empties every table and deletes every non-admin account, keeping only admin
logins, and puts `site_settings` back to its defaults. It exists because
testing the app means filling it with throwaway patients and bookings.

Four gates, all of which must pass:

1. `ALLOW_DEBUG_DATA_RESET=true` in the **server** environment. Deliberately
   not `NEXT_PUBLIC_SHOW_DEBUG_NAV` -- that one is public and already true
   on the deployed site, so reusing it would arm a data wipe for anyone who
   can reach the page. Unset, the route answers 404, not 403.
2. A signed-in admin.
3. ...with `full` scope.
4. The exact phrase `RESET ALL DATA`, typed by hand in the UI.

The wipe is one `TRUNCATE` inside a database function, not a list of deletes
from the route: it is atomic (a half-emptied database is worse than none),
it is one round trip, and three of the tables have no `id` column for a
filtered delete. The function refuses to run if it would leave no admin
behind. `EXECUTE` is revoked from `anon` and `authenticated`, so only the
service-role key can call it.

**`treatment_categories` and `treatment_category_packages` are kept.** They
are the one part of that list an admin builds by hand rather than generates
by testing -- the conditions the public pages show and the programmes a
therapist may recommend under each -- so emptying them meant retyping the
catalogue after every reset, and the public site came back with nothing on
it, which reads as the clinic having shut rather than as test data being
cleared. Keeping them is safe alongside the rest going, because
`TRUNCATE ... CASCADE` reaches tables that *reference* the truncated ones
and never the reverse: appointments, care plan versions and purchases all
point **at** a category or a package. A purchase reads its frozen
`package_snapshot` rather than the live row, so a surviving package cannot
rewrite what somebody already bought. Home-visit packages, service areas,
FAQs, testimonials and the question templates are still cleared; take one
out of the list the same way, one at a time with its own reason, rather
than exempting "the catalogue" as a category nobody can check.

**The route reports what the function returned.** It read
`accounts_deleted` where the function returns `deleted_accounts`, and asked
for an `admins_kept` it never returned, so a wipe that had just emptied
every table answered "0 accounts deleted, 0 admins kept" -- indistinguishable
from a reset that did nothing, on the one control whose result cannot be
checked by looking at the screen behind it.

**Every UPDATE and DELETE in that function needs a WHERE clause, even the
ones meant to hit every row.** Supabase preloads pg-safeupdate for the
`authenticator` role -- the one PostgREST connects as -- so a bare
`update risk_rules set ...` is refused with `UPDATE requires a WHERE clause`,
and the reset had never once worked from the app. Three things make this
easy to reintroduce. `security definer` does not get round it: the library is
preloaded into the *session*, so the hook runs whoever the statement ends up
executing as. It is invisible to every other way of running the file --
`scripts/run-schema.mjs` and the schema-apply workflow both connect as
`postgres`, which has no such preload, so the function installs cleanly and
only the one caller that matters cannot run it. And it covers UPDATE and
DELETE only, which is why the `TRUNCATE` at the heart of the wipe was always
fine. Write the predicate so it still means "every row" and still reads as a
real one -- `where rule_key is not null` on a NOT NULL key, or `where id` on
the boolean-keyed `site_settings` singleton, rather than a `where true` that
reads as a token added to silence a check.

**A data reset resets data, not configuration -- so `site_settings` and
`risk_rules` are not touched at all.** The function used to put every one of
~60 settings columns back to its default, on the reading that a reset restores
a clean baseline. That reading is wrong in the one direction that costs an
owner something: **none of that is data.** Every column there is something a
person chose -- the clinic's name, its tagline and description, the email and
phone patients contact it on, the footer, the mission and vision, the splash
wording, and every window, lead time and switch an admin set deliberately.
Testing generates none of it, and a reset that cleared it handed back a site
calling itself something else with somebody else's contact details on it,
every time somebody cleared a few test patients.

The asymmetry decides it: keeping them costs a tester who wanted a clean config
baseline a few fields, each with its own control on its own screen; clearing
them costs an owner their clinic's identity, and the mission and vision have no
"what was it before" anywhere. `risk_rules` goes the same way -- the thresholds
are an admin's tuning on Today -> Risk, while the signals they produced are
rows and are still truncated.

**`faqs`, `testimonials` and `mission_principles` are kept for the same
reason**, one table at a time with its own reason, as
`treatment_categories` already was. They are the website's own content, written
on Settings -> Public Site. `mission_principles` used to be cleared on the
argument that the pages then fall back to the shipped wording in
`src/lib/mission.ts` -- true, and exactly the argument an owner rejects the
first time a reset replaces their promises with ours.

**Adding a table means adding it to that `TRUNCATE` list**, or a reset
silently leaves its rows behind -- and `create or replace` means the **last**
declaration in the file wins, so edit that one. There are ten; editing an
earlier one changes nothing and reads as though it did.
`scripts/debug-reset-sql-checks.sql` asserts both halves -- the test data that
must go and the clinic's own writing that must survive -- and **must never be
run against a database anything else is using**: a ROLLBACK undoes the rows and
not the locks, and TRUNCATE takes an AccessExclusiveLock on every table. It
took an e2e case down with a deadlock the first time it was run, which is a red
line describing nothing but carelessness. Before real patients exist, remove
`ALLOW_DEBUG_DATA_RESET` and drop the function.

## Gotchas

- **The debug bar is on in every environment, on purpose.** The app is
  pre-launch with no real patients, so `isDebugNavVisible()`
  (`src/lib/debugNavVisible.ts`) returns true unless
  `NEXT_PUBLIC_SHOW_DEBUG_NAV` is exactly `"false"` - local dev,
  `next build` + `next start`, and the deployed site alike. It used to
  default off whenever `NODE_ENV === "production"`, which hid it in the one
  environment worth checking a published change in. Don't gate it back
  behind `NODE_ENV`, and don't reintroduce the ten copies of that
  expression: the root layout, three dashboard shells and six pages that
  hide the shared Navbar all call the one helper. At real launch, **delete**
  the bar rather than flipping the flag - it is a public flag, and the bar
  names every route including `/admin/login` and `/admin/dashboard`.
- **No `.env` file that arms the reset is committed, and two have been.**
  `.env.production` armed both the public debug nav and the whole-database
  reset on the live site. `.env.development` then did the same thing one
  file over: tracked in git despite `.gitignore`'s own `.env*` rule, and
  setting `ALLOW_DEBUG_DATA_RESET=true` for every `next dev` on every
  machine that cloned the repo -- against whatever `NEXT_PUBLIC_SUPABASE_URL`
  happened to point at, which on a developer's machine is often the real
  project. Its own header said to delete it before real patients existed,
  and CLAUDE.md says the flag "stays unset"; a committed file setting it to
  true is that rule being false in the one direction that costs a database.
  Both are gone. The flag is documented in `.env.example` and belongs in a
  server environment somebody set on purpose, never in a file a clone
  brings with it.
- **`.env.production` stays deleted.** It armed both the public debug nav
  and the whole-database reset on the live site. The nav no longer needs it
  (the default above covers it), and the reset must never be armed from a
  committed file - `ALLOW_DEBUG_DATA_RESET` belongs in a server environment,
  set deliberately, against a project whose data is throwaway. Check the
  hosting dashboard's own env vars too, since a file cannot clear those.
- **The page behind an intercepted overlay is the dashboard, not a frame
  that looks like it.** The admin's patient, therapist and condition details
  are normally an overlay -- the dashboard intercepts the route
  (`@modal/(.)patients/[id]`) and draws the detail over the screen you were
  on. Interception applies to **client-side navigation only**, so a reload, a
  shared link, a new tab and any refresh that misses the router's own state
  land on the real page underneath.
  That page went through two wrong answers before this one. First a bare
  `<section>` with a "← Back to Dashboard" link and no chrome at all. Then
  `AdminDetailFrame`, which reproduced the rail and the section list and was
  **deliberately reduced** -- no badges, no search, no tab state -- on the
  reasoning that a leaf page does not need them. That reduction *is* the
  bug: a second shell missing three things the first one has does not read
  as a leaf page, it reads as a different, plainer site, and it was reported
  as exactly that from the one flow that refreshes (reassigning a session
  from a therapist's profile).
  `AdminDetailDashboard` renders **the dashboard page itself** with the same
  `DetailOverlayModal` on top, so the two ways in are pixel-identical. Three
  rules:
  1. **It renders the real page, never a copy of its chrome.** A second
     implementation of the shell is a second thing to drift, and the last
     two attempts both drifted in the same direction.
  2. **The cost is on the rare path only.** Tapped from inside the dashboard
     the detail costs its own queries and nothing more -- the dashboard
     behind it is already rendered. A direct load pays the dashboard's ~49
     queries as well, which is what that URL would have cost had they
     reached it the usual way.
  3. **Closing is a URL change and nothing else.** `router.push` would
     re-run those ~49 queries to paint what is already on screen, so
     `DetailOverlayModal` takes a `closeHref` and uses
     `history.replaceState` plus a local flag -- the same History-API rule
     `AdminShell`'s own tab state follows. `replaceState` rather than
     `pushState`, since a direct load has no entry of ours behind it and
     Back would otherwise reopen the overlay just shut. Without a
     `closeHref` (the intercepted case) it is still `router.back()`, which
     returns to the exact screen, filters and scroll the admin left.
  **And the shell honours the screen the server chose when the URL names
  none.** `applyFromLocation` read `?section=`/`?tab=` alone, so on a detail
  route -- which carries no query at all -- it threw the server's answer
  away on mount and reset the dashboard behind the overlay to Today.
  Closing then revealed a screen nobody had asked for. The URL still wins
  whenever it names a screen, which is what keeps a deep link, a pushState
  and the Back button landing where they say; `initialSection`/`initialTab`
  are the fallback, not the override. `e2e/admin-detail-overlay.spec.ts` is
  the guard, driven as screens because the routes and the data are
  unchanged and all of this is what a person sees.
- **A full-screen overlay opened from inside another one must be portalled.**
  `position: fixed` is relative to the viewport *until* an ancestor carries
  `transform`, `filter`, `backdrop-filter`, `perspective`, `contain` or
  `will-change` -- that ancestor then becomes the containing block, and the
  overlay is measured against its box instead. Every modal in this app sets
  `backdrop-blur-sm`, which is a `backdrop-filter`, so **any modal is one of
  those ancestors**. Mark Done on a patient's profile was the case that
  showed it: the confirmation renders inside `DetailOverlayModal`, so its
  dark sheet covered only that modal's scrolling panel, the prompt sat at
  the top of the scrolled content rather than in front of the reader, and it
  slid away as they scrolled. Nothing was wrong with the dialog.
  `OverlayPortal` (`src/components/system/OverlayPortal.tsx`) renders into
  `document.body`, which has no such ancestor, so `fixed` means the viewport
  again. Two rules:
  1. **Portal the ones that can be nested**, which is every dialog opened by
     a tap -- `ConfirmDialog`, `admin/Modal`, `SessionDetailDrawer`,
     `PainExamDialog`, `ConditionTriageDialog`. React portals bubble along
     the **React** tree rather than the DOM one, so a dialog inside a panel
     that stops propagation behaves exactly as it did: this moves pixels,
     not clicks.
  2. **Never portal a server-rendered overlay.** The admin's `@modal` detail
     routes (`DetailOverlayModal`) are in the initial HTML; portalling them
     renders nothing on the server and pops the modal in after hydration.
     They are also always outermost, so they have nothing to escape.
  The five `motion.div` overlays inside an `AnimatePresence` are left alone
  deliberately -- a portal between the two stops `AnimatePresence` seeing its
  child and kills the exit animation, and all five are outermost, with every
  dialog that can open inside them portalled from the child side, which is
  the side that matters.
- **Every route tree has an error boundary, and a thrown message never
  reaches the screen.** `RouteError` / `RouteLoading`
  (`src/components/system/`) back `error.tsx` and `loading.tsx` in each
  dashboard, with `global-error.tsx` for a root-layout throw (it inlines its
  styles and supplies its own `<html>`, because at that point nothing else
  has rendered). An Error's message can carry a column name or a row id and
  patients see these screens, so only Next's `digest` is shown. A dashboard
  `loading.tsx` must pass `withSidebar`: the patient, therapist and hospital
  dashboards render their sidebar per page rather than in a layout, so a
  bare skeleton would blank the chrome on every navigation.
- **A display code outlives the role that generated it.** `handle_new_user`
  inserts every self-signup as a patient, so an account promoted to admin or
  hospital later keeps its `PT####`. The unique indexes are scoped to the
  column (`where patient_code is not null`), not the role - so anything that
  resyncs `patient_code_seq` must take its max the same way, over **every**
  non-null code regardless of role. Scoping the max by role set the sequence
  back below codes held by promoted accounts, and signup then failed
  intermittently with a duplicate key, surfacing as a 500 from
  `auth.signUp` with an empty body. `assign_profile_code` /
  `assign_session_code` now also loop past a taken code rather than trusting
  the sequence, so a drift from any other cause (a restore, a manual insert)
  cannot break signup again.
- **A fallback that is silent is half a fix.** `findTab` landing somewhere
  valid is correct -- a stale bookmark must not produce a blank page -- but
  on its own the tap just goes somewhere else and looks like it worked.
  `AdminShell` now compares the screen the URL *asked for* against the one it
  resolved, and when an admin's scope is why they differ it says so in one
  amber line with a Dismiss. It names only a tab that exists in the nav: an
  unknown key is a stale link, and telling somebody they lack access to a
  screen that was never there is worse than the silence it replaces. The case
  that produced it: Finance following **Book for a patient** from `/book`
  reads Sessions and cannot change one, so New Booking is not theirs and they
  arrived at the Schedule calendar with nothing saying why.
  Two related bugs came out of the same path and are worth not
  reintroducing. `WrongAccountForBooking` linked to `?section=sessions` with
  **no tab**, so every admin scope -- Master Admin included -- landed on the
  month grid from the one button in the product named "Book for a patient";
  a `?section=` with no `?tab=` is a link to a section's first screen, not to
  the screen you meant. And `AdminShell`'s own popstate handler called
  `findTab` **without `limitedScope`**, so a limited desk deep-linking to
  Today -> Activity, or pressing Back to it, resolved the URL differently
  from the server that had just rendered it. Both arguments are easy to omit
  and neither failure announces itself.
- **A hardcoded `?section=&tab=` link is a dead link waiting to happen.**
  `findTab` falls back to a section's first screen when the tab key is
  unknown, so a stale link looks like it works - it just quietly lands
  somewhere else. Two feed items pointed at `today&tab=requests` and
  `today&tab=sync`, tabs that never existed. Build these with
  `adminScreenHref(section, tab)`, which is typed against `adminNav.ts`.
- `graphify-out/` is CI-generated (`.github/workflows/graphify.yml`); only
  `graph.json`, `GRAPH_REPORT.md` and `manifest.json` are committed. Don't
  hand-edit them. `manifest.json` is the per-file hash record `--update`
  diffs against, and it is committed for a reason: without it every CI run
  re-extracts the whole corpus, and the semantic pass then spends the Gemini
  free tier's 20 requests per day on files nothing touched, which is what
  made the workflow fail with a wall of 429s. That failure is now soft --
  the run retries with the key unset and commits a structural graph rather
  than leaving the committed one stale.
  **It arrives as a pull request, not as a commit on the branch it was
  triggered by.** The workflow used to push straight to that branch, which
  the ruleset rejects (`GH013`), so it failed on every merge and threw away
  the graph it had just built. It triggers on `staging` now rather than
  `main` -- the graph should be rebuilt where code lands, and `staging` is
  the default branch; its PR is based on `github.ref_name`, so the trigger
  is the only thing deciding the target. It force-pushes one long-lived `chore/graphify-refresh`
  branch and opens a PR from it instead -- deliberately not a commit onto the
  branch that was merged, since sessions here push to their own `claude/*`
  branches constantly and a CI commit landing underneath one turns their next
  push into a rejected non-fast-forward. Merging that PR is what keeps
  `manifest.json` current, so leaving it open has the exact cost the
  paragraph above describes. Opening the PR is itself refusable, by
  **Settings -> Actions -> General -> Allow GitHub Actions to create and
  approve pull requests** (off by default, and off here): that refusal is
  soft too -- the branch still carries the graph and the job summary links
  the "open a PR" page -- because failing on it would put the workflow back
  to red on every merge for a reason the red X could not explain.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, Google
  credentials) are server-only. Never add a `NEXT_PUBLIC_` prefix to them and
  never commit real values.

---

## The proxy's profile cookie

`src/proxy.ts` guards four dashboard route trees, and it runs on **every**
request under them — every client-side navigation, not just every page load.
It used to make two network calls to Supabase in sequence: `auth.getUser()`,
then a `profiles` select for `role`, `approved` and `active`.

`getUser()` stays. It refreshes the access token, and the cookies it writes
through the `setAll` callback are load-bearing — the comment above
`redirectTo` in `src/lib/supabase/proxy.ts` describes the sign-in loop that
happens when a redirect loses them.

The second call is now a signed cookie, `src/lib/proxyProfileCache.ts`:

- The three fields are written with the user id they belong to and an
  expiry, HMAC-signed (Web Crypto, because the proxy runs on the Edge
  runtime where `node:crypto` is unavailable) with
  `PROXY_PROFILE_CACHE_SECRET`.
- **The signature is the whole guarantee.** Without it the cookie is a
  sentence the browser gets to write, and the sentence is "this user is an
  admin". Never give that variable a `NEXT_PUBLIC_` prefix.
- **The user id in the payload is the second guarantee.** Without it, a
  cookie minted for one account would verify for another after a sign-out
  and sign-in on the same browser. Verification is constant-time, so a wrong
  signature leaks nothing through timing.
- **Only a successful read is cached.** A failed `profiles` read is "we could
  not check", and caching that would turn one transient error into a minute
  of them — the same rule as everywhere else here.
- **No secret configured means no caching**, and the proxy falls through to
  the read it always did. A missing environment variable makes the app
  slower, never wrong and never open.

**The trade-off, which is real and was chosen deliberately:** for up to 60
seconds a session that is *already open* keeps the role and flags it had when
the cookie was written. Suspending an account, demoting an admin or revoking
an approval therefore takes up to a minute to lock out a tab already sitting
on a dashboard. New sign-ins are unaffected. Sixty seconds is the longest
window that is still shorter than a person noticing and acting; it is
deliberately not minutes.

The cookie is `httpOnly`, so the client-side sign-out buttons cannot clear
it — and do not need to. A signed-out browser has no user for the id to
match, and a different user signing in fails the id check and re-reads.
`stop-impersonation` clears it explicitly anyway, at the one moment the
server already knows it is stale.
