# The admin back office

The seven sections, scopes and levels, User Access, the Settings information architecture, System Health, the activity log, exports, and how a count links to its own rows.

**Mostly lives in:** src/lib/adminNav.ts · adminScope.ts · adminHome.ts · systemHealth.ts · activityLog.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **The admin dashboard's information architecture lives in
  `src/lib/adminNav.ts`** - seven sections (Today, Sessions, People, Money,
  Catalog, Logs, Settings), each with its own screens. The sidebar, the URL
  (`?section=&tab=`), the content map in the dashboard page, and the scope
  check all read that one list, so adding a screen is one entry there plus
  one entry in the page's `screens` map. Tab state is written with the
  History API, never `router.push`: the dashboard is a single Server
  Component making ~40 queries, and a router navigation would re-run all of
  them to move between two already-rendered screens. The page also reads
  `?section=/?tab=` server-side and passes them to `AdminShell` as
  `initialSection`/`initialTab`, so a shared deep link server-renders that
  screen instead of painting Today first and jumping once the client effect
  runs.
- **People -> Abandoned checkouts is a list of leads, never approvals.** It
  reads `abandoned_booking_accounts()` (service role only): patients who
  signed up inside a booking wizard and have not paid, so their account is
  locked (`booking.md`). Each card names the contact details, the session
  they wanted, tries used of `payment_tries_before_access`, and the date
  `purge_abandoned_booking_accounts` (the maintenance sweep) removes the
  account if it stays unpaid -- `abandoned_booking_account_days` after
  signup, both set under Settings -> Booking Rules. **The same ids are
  filtered out of Today -> Approvals**: nobody reviews these accounts, and
  approving one would hand a dashboard to somebody who has not paid. A
  failed read is said ("couldn't be loaded") and leaves the approvals queue
  unfiltered rather than empty. Read-only on purpose. The purge deletes only
  accounts carrying the wizard's `signup_source: 'booking'` signup
  metadata, older than the window, below the try limit, with no payment,
  purchase, or session past an unpaid `requested` draft -- a
  `/patient/register` signup is never touched.
- **A scope that could not be read is refused, never promoted, and a
  screen outside the scope never leaves the server.** `resolveAdminScope`
  answers the guard: a real value passes, a failed read or an unknown value
  is `unavailable` (the retry page, a 403 from `requireAdminScope`), and the
  one exception is an unknown-column error, because on a database without
  `admin_scope` no limited admin can exist. `parseAdminScope` (unknown reads
  as `full`) is for *displaying* another admin's row only. The dashboard
  page then filters its `screens` and `badges` maps through
  `visibleScreenKeys` before handing them to `AdminShell`: hiding a screen
  in the client is presentation, and everything passed as a prop is in the
  RSC payload a Finance desk can read.
- **No password is issued, stored or shown - an admin hands over a
  one-time link.** Creating or resetting any account (the four
  `reset-*-password` routes, `/api/admin/create-account`,
  `/api/admin/onboard-hospital`) gives the account a password nobody knows
  (`unknowablePassword`) and returns a one-time Supabase recovery link
  (`issueSetPasswordLink`, `src/lib/accessLink.ts`) as a path to
  `/reset-password?token_hash=...`, which that page verifies with
  `verifyOtp`. The admin copies it from `SignInLinkResult` and sends it;
  the person sets their own password. Nothing readable is written to the
  `*_admin_notes` tables (the plaintext earlier versions kept there is
  cleared by `schema.sql`), so a lost link costs nothing - the person's
  page or row issues another, and a reset still locks out the old password
  at once. This replaced keeping the generated plaintext for up to 14 days
  so it could be read back: a working credential for every recent account,
  one service-role leak - or one look at the screen - away. The link is
  never written to the activity log. Its lifetime is Supabase's email OTP
  expiry (Authentication settings); raise it there if a day is needed.
  A password a person chose is a bcrypt hash and can never be shown.
- **User Access is where the access model is read, and it is derived.**
  Settings → User Access is one screen doing what two half-screens did: the
  back-office directory (who can sign in, at what level, and whether they
  still can) and the **matrix** - rows are the jobs people describe, columns
  are the four desks, cells come out of `ADMIN_CAPABILITY_GROUPS` +
  `sectionAccess` in `adminScope.ts`. Nothing in the product said what a
  scope *meant* before it: an owner deciding whether to hire somebody into
  Operations could read four one-line blurbs, or read the source.
  Three rules hold it.
  1. **The matrix is derived, never a second list of permissions.** Every
     cell is answered by the module the routes enforce with, so the screen
     cannot claim an access nobody has. A hand-maintained copy goes stale the
     first time a scope changes, and then the screen showing it is lying
     about the one thing it exists to explain. Add a capability row only when
     the grid already decides its answer; a capability needing its own rule
     wants the rule in the grid.
  2. **The cells are not checkboxes.** A tick that does not change a route is
     a lie, and making them real means a per-capability check at 119 routes -
     the fine-grained matrix whose failure mode is one route quietly falling
     through a gap in it, which is what coarse scopes exist to avoid.
     Changing what a desk reaches is a code change, reviewed.
  3. **Suspending is not deleting, and delete is the narrow case.**
     `/api/admin/delete-account` exists on all four roles' screens, and it is
     a delete that can only ever succeed on an account with **no history at
     all** -- the typo'd email, the duplicate, the one created against the
     wrong person. That is not a policy: thirty-five tables carry a foreign
     key to `profiles(id)` with no ON DELETE behaviour, so Postgres refuses
     outright for an account that has booked, paid, been paid, been treated
     or acted in the back office, and deleting one "properly" would mean
     deleting the money and the clinical record with it. So the route counts
     what points at the row first, groups it the way a person describes it
     (`src/lib/accountDeletion.ts` -- six groups, not fifty columns), and
     refuses with the counts named and **suspension offered beside them**,
     the same shape `describeCategoryBlockers` uses. Four rules:
     it is `full` scope only, checked directly rather than through
     `requireAdminScope("people")`, because every desk that manages People
     can already suspend and this one is irreversible; it carries suspension's
     own two guards, never yourself and never the last Master Admin who can
     still sign in; the audit row is written **before** the delete, since
     afterwards there is no row left to name and a failed attempt is worth
     recording on the one action with no undo; and it re-reads the profile
     afterwards, because GoTrue reporting success is not the same as the row
     being gone -- "removed nothing" and "removed it" must stay
     distinguishable. The counted groups are for the human; the database is
     still the authority, and a foreign key the probes do not cover produces
     `ACCOUNT_DELETE_REFUSED` rather than a Postgres string.
  3b. **What blocks a delete is asked of the database, never listed.** The
     route kept a hand-written list of the columns to count, and it drifted:
     35 foreign keys into `profiles(id)` carry no ON DELETE behaviour and the
     list named 13 of them. For the other 22 the screen offered a delete, the
     database refused, and the admin met `ACCOUNT_DELETE_REFUSED` -- a
     sentence apologising for a list being out of date.
     `account_blocking_references(uuid)` reads `pg_constraint` for every
     single-column FK into `profiles` whose delete action is NO ACTION or
     RESTRICT and counts the rows each holds, so a table added tomorrow is
     counted the day it arrives. The route keeps a table -> group map for the
     six words a person reads; that is **wording only**, and an unmapped
     table still counts and still blocks -- it lands in `other` rather than
     being folded into the nearest group, because "2 back-office actions"
     about a clinical table sends an admin to the wrong screen. Cascading and
     set-null references are deliberately not counted: they do not refuse.
     A read that fails is a **503**, never "nothing is in the way" -- the
     rule in `CLAUDE.md` ("a check that could not be run is not a check that
     came back negative"), applied to the one action with no undo.
     **It counts `auth.users` as well as `public.profiles`, because that is the
     row the delete actually removes.** Asking about `profiles` alone was the
     same drift one table over: the delete goes through GoTrue, so a foreign key
     into `auth.users` refuses it while the screen reports nothing in the way --
     chiefly `storage.objects.owner`, which every account that has uploaded an
     avatar carries. So the screen offered the delete, the database refused, and
     the admin met "The database refused to delete that account and did not say
     why", which is the sentence this function exists to prevent. `confrelid in
     ('public.profiles'::regclass, 'auth.users'::regclass)` and the label is
     **schema-qualified**, so `storage.objects` is distinguishable from a
     `public` table of the same name. Uploaded files get their own `files` group
     rather than landing in `other`: they are the expected hit and they are
     clearable, and "2 other records" sends an admin to no screen at all.
     This is also exactly why `e2e/admin-account-delete.spec.ts` kept passing --
     its fixtures are minted through the API and never upload anything.
     3b-i. **And the delete itself names what refused.**
     `admin_delete_account(uuid)` (`security definer`, three revokes) removes
     the `auth.users` row as the function's owner and, on
     `foreign_key_violation`, returns the offending **table and constraint** out
     of `GET STACKED DIAGNOSTICS` instead of GoTrue's empty 500. That is what
     makes the fix independent of the diagnosis above being complete: whatever
     refuses, the admin is told which table it was, and a foreign key nobody
     thought to count is a sentence rather than an apology. The route's two
     `ACCOUNT_DELETE_REFUSED` exits stay as the last resort, and the silent
     post-delete re-read logs now. A missing function (`PGRST202` / `42883`) is
     answered with "re-apply `schema.sql`", since that is the one cause.
  3c. **And the guard that counts Master Admins runs as its owner.**
     `profiles_keep_one_master_admin` had no `security definer`, so it ran as
     whoever issued the statement. Every writer in this app uses the
     service-role client, so it was correct everywhere except the one caller
     that is not this app: `auth.admin.deleteUser` executes as GoTrue's
     `supabase_auth_admin`, which has **no SELECT on public.profiles**.
     Deleting the auth user cascades into profiles, the AFTER-DELETE trigger
     fires as that role, its `select count(*) from profiles` is refused, and
     the refusal aborts the cascade -- so GoTrue answered 500 with an empty
     body and **no admin account could ever be deleted**, from any screen,
     however empty. A patient or therapist was unaffected, because the guard
     returns at `touched` when the statement removed no Master Admin and so
     never reads the unreadable table -- which is exactly what made it look
     like a data problem. It is `security definer` now; granting GoTrue
     SELECT on the whole of profiles to satisfy one count would have been the
     wider fix. It takes no revokes, per `check-function-grants.mjs`: a
     trigger function cannot be called by name, so an EXECUTE grant on one is
     not reachable. `e2e/admin-account-delete.spec.ts` is the guard, and its
     negative control is worth keeping in mind -- re-introducing either blind
     spot reproduces the reported sentence verbatim.
  4. **Suspending is not deleting.** `/api/admin/set-admin-active` mirrors
     `set-admin-scope`'s two guards (not yourself, not the last Master Admin
     who can still sign in) and flips `profiles.active`, which `getAdminUser`
     and the proxy already refused on - the enforcement existed and the
     control did not, so closing the door on somebody who left needed
     database access. The account stays because the admin's id is on every
     audit row they ever wrote.
  `src/lib/adminScope.test.ts` holds the grid's invariants - every pair has a
  level, manage never outruns open, every section has a capability group, and
  every group has at least one read-only row, without which a group cannot
  show the difference between `view` and `none`.
- **Settings is eleven screens under four captions, and the captions are part
  of the definition.** `AdminTabDef.group` (`src/lib/adminNav.ts`) names the
  caption a screen sits under, and `AdminShell` draws one whenever the group
  changes -- so screens sharing a caption must be **adjacent** in that array
  or the caption is drawn twice. Four: *Your website*, *How the clinic runs*,
  *Who gets in*, *Technical*. A flat list of eleven labels is one nobody reads
  top to bottom, which is the same failure the per-screen blurb fixes one
  level down. Sections with a short screen list name no groups and render
  exactly as before.
  Two screens moved in the same change, both because the label on the door
  was wrong about what was inside. **Sign-in & Security** (was *Account
  Security*, one button to email yourself a reset) now also carries the idle
  timeout and the sign-out banner, which sat on Booking Rules under a heading
  promising "when a patient may book, cancel, and join a video session".
  **Advanced** is the technical shelf: `entitlement_ledger_authoritative`
  alone, taken off Programmes & Home Visits where it sat between two rules
  about how a programme is sold. A switch belongs there when the clinic's own
  judgement cannot answer it *and* it is about how the app works inside rather
  than what it sells -- the test the ledger switch fails on both counts
  elsewhere, since its own help text sends the reader to System Health.
  Settings is `full` scope only, so Advanced needs no further gate.
  **Dev Reachouts is the one screen under Settings that is not about the
  clinic.** It is the developer's own inbox -- messages left through the
  "Contact me" link in the footer's credit line (`/developer/lets-talk` ->
  `/api/developer/reachout` -> `dev_reachouts`) -- plus the two switches that
  publish that page. It sits after Advanced so *Technical* stays one adjacent
  run, and it is `settings` scope on every layer, deliberately **not** the
  `people` scope the clinic's own lead pipelines use: a scoped admin must not
  receive a stranger's name, email and number, so the dashboard reads the
  table only when `scopeCanOpen(viewerScope, "settings")` and
  `/api/admin/update-dev-reachout` (status) and `/api/admin/dev-reachout-note`
  (add / edit / delete a note) are `requireAdminScope("settings")`. Notes are
  a dated thread, one `dev_reachout_notes` row each, oldest first, with author
  and an `edited_at` that stays null until a note changes; the old single
  `dev_reachouts.admin_note` was carried into it and is no longer read. The
  notes are a second read, so a failed one shows "could not be loaded", never
  an empty thread that invites a duplicate. Three
  rules are easy to undo. **The credit switch asks on BOTH directions** and
  saves nothing until the dialog is confirmed -- cancelling leaves the switch
  where it was -- because turning it off closes `/developer` for every
  visitor and turning it on opens it; the dialog is awaited *before* the
  transition, never inside it. **The published email defaults to blank and
  nothing is committed**: the owner types it into the card, and while it is
  blank the "Prefer email?" row is hidden and the form still works (blank is
  the one email value `update-setting` accepts, since it is how an address is
  taken back down). And **the audit log never carries the note's text** --
  `dev_reachout.add_note` / `edit_note` record only `noteLength` (and
  `delete_note` only the note's id); a note is free text
  about a person. `dev_reachouts` is in `ADMIN_REALTIME_TABLES`, so a new
  message arrives without a reload. Both tables and both `dev_contact_*`
  settings survive the debug data reset (see `ops-security.md`).
  **A settings screen taller than a couple of screens carries a map of
  itself.** `SettingsJumpNav` + `SettingsSection`
  (`src/components/admin/SettingsJumpNav.tsx`) put a sticky strip of anchors
  above Public Site (4,300px) and Programmes & Home Visits (3,100px). Plain
  `<a href="#id">`, and the ids are prefixed per screen because the shell
  keeps every screen mounted behind `hidden` -- two screens naming a section
  "Testimonials" would collide on one id. Its `offsetTop` matches
  `AdminShell`'s: the pre-launch debug bar is fixed and 41px tall, and a strip
  stuck to `top-0` parks underneath it.
  **Two settings can be set into a combination where one does nothing, and
  the screen says so.** The join control reads the Session Completed cutoff
  before the join window (`JoinSessionButton`: `completed` wins over
  `isJoinable`), so a cutoff at or below the after-window makes the grace
  period unreachable. Booking Rules shows an amber line, computed off the
  typed values rather than the saved ones so it appears while the owner is
  still deciding. Stated, never refused: both numbers are legitimate alone,
  and which one they meant to move is theirs.

- **A settings screen says what it is and gives an example.** `AdminTabDef`
  carries an optional `blurb` and `example`, and `AdminShell` prints them
  under the page heading in place of the section's own line. Every Settings
  screen has both, because a section blurb cannot do this job: eight screens
  all sat under "How the product behaves", so the header explained nothing
  on the section people open least often and therefore remember least well,
  and a label alone ("Brand & Contact", "System Health") names a category
  rather than an action. The blurb is what the screen is, in a clinic
  owner's words -- no jargon, no column names, no feature names; if a
  sentence needs one, the screen is doing too many things and wants
  splitting. The example is one concrete thing you would come here to do,
  which is the half that makes an unfamiliar screen usable.
  **Every Money screen carries both too**, for a sharper version of the same
  reason: five screens named with abstract nouns ("Summary", "Breakdown",
  "Costs") make an owner open three of them to find the one answering the
  question they arrived with. The worst case of that was a dead end rather
  than a detour -- promo codes rendered on Money -> Summary while Settings ->
  Offers, the README and the QA plan all said Money -> Costs, so following
  that note landed on a screen with no promo codes anywhere on it. A campaign
  belongs beside the figure it costs (*Discounts given*), which is where it
  is now.
  **Booking Rules was that "too many things" case**, and splitting it is
  what the field was added alongside. It had grown six unrelated stacks with
  no heading between them -- when a single session may be booked, cancelled
  and joined; the two acquisition discounts; the recommendation rules; the
  programme rules; the nine home-visit settings -- so an owner opening it to
  change a refund window scrolled past the discount that decides what every
  new patient pays. It is three screens now: **Booking Rules** (one video
  session), **Offers & Discounts** (money off, to win a patient), and
  **Programmes & Home Visits** (more than one appointment, arranged in
  advance). Offers carries a note saying where promo codes and goodwill
  live, because "where did the promo screen go" is the question a split
  otherwise creates.
- **System Health is thirteen checks in one shape, and every unhealthy one
  says how to fix it.** They are, in the order the screen draws them:
  **Payment Confirmations**, **Google Connection**, **Session Links**,
  **Waiting Room**, **Books & Sessions Agree**, **Public doors**, **Partner
  attribution**, **Settlement record**, **Refunds**, **Patient files**,
  **Pay Later**, **Activity log**, **Checkout speed** - the `HealthCheckId` union in `src/lib/systemHealth.ts` is
  the list. Do **not** number them by ordinal in prose: four passages here
  and in `CLAUDE.md` said "the sixth check", "the seventh", "the ninth",
  "the tenth", and every one of them was wrong within two additions, because
  a check added in the middle renumbers the rest silently. Name the check. The screen reports rather than sets, so it is not an
  `AdminFeatureControlTab` view -- `src/lib/systemHealth.ts` decides each
  check's status, its one-line headline, the numbered steps that fix it, and
  the *what this watches* / *for example* pair behind its (i) button, and
  `AdminSystemHealthTab` draws what that module returns. It replaced five
  panels that each explained a subsystem in its own words and its own layout:
  an owner had to read all of them to learn nothing was wrong, and the one
  sentence naming the fix was buried mid-paragraph. Four rules hold it:
  1. **A status is a word as well as a colour** (`Healthy`, `Needs a look`,
     `Needs you now`, `Not set up`, `Not checked`), and **`off` and
     `unknown` are not faults**. An owner who never wired Google up has not
     got a problem, and painting that red is how red stops meaning anything
     -- `needsPerson()` is the one test for "this is asking for somebody".
  2. **Anything not healthy carries steps the owner can follow alone.** A
     red card with no way out is the screen this replaced. `systemHealth.test.ts`
     asserts it over every check.
  3. **The teaching text lives behind the (i), never on the card.** It is
     what somebody needs the first time they open the screen and never
     again; inline, it is the wall of text that made the old one unreadable.
  4. **The sidebar badge counts checks, not rows**, so it equals the verdict
     strip's own count and its chips. Counting rows badged **0** for the two
     failures with no rows behind them -- a missing `RAZORPAY_WEBHOOK_SECRET`
     (money arriving against unpaid bookings) and a dead Google credential.
  5. **A red check leaves the screen; an amber one does not.** `healthBannerText()`
     puts one red line on the admin's Today screen (`AdminHealthBanner`, via
     `DashboardOverview`'s `banner` slot, and only for a scope that can open
     Settings -- the banner is a link, and `findTab` would land a scope that
     cannot on some other screen entirely). Red only, because the two worst
     failures are invisible from every other screen and nobody opens System
     Health until they already suspect trouble -- while a banner that is
     usually there is a banner nobody reads.
  6. **A cached answer prints its own age.** Every check but Google is
     computed at render; the Google probe is held ten minutes on success and
     one on failure, so it passes `googleConnectionCheckedAt()` and the card
     says "Checked 4 minutes ago". The relative time is rendered after mount,
     never on the server -- "4 minutes ago" computed server-side is already
     wrong in the browser, and rendering it in both is a hydration mismatch.
  A twelfth check is an entry in that module plus, if it has rows, a card
  body in the tab -- never a new panel with its own shape. The two fix
  buttons render only under `scopeCanManage(scope, "settings")`, matching the
  routes.
  **Refunds watches the one direction of money that had
  nothing watching it.** Every gateway refund claims its local row first and
  calls Razorpay second, deliberately, so a refusal leaves no trace claiming
  money went back -- but the opposite failure, Razorpay accepting the refund
  and the write recording it failing, left the money gone, `refund_id` null,
  and the session indistinguishable from one that was claimed and never sent.
  All four refund writers had that window and in all four the only thing that
  noticed was a `console.error`. `refund_attempt_health()` asks the two
  questions `refund_attempts` makes askable, and they are different: a refund
  sent to the gateway whose answer was never recorded, and a refund the
  gateway accepted whose own session or purchase carries no id. Both red;
  both reported and never repaired, since no screen here can know whether
  Razorpay took the money. Its window (`REFUND_STUCK_AFTER_MINUTES`, 10)
  exists because a row is legitimately unresolved for the length of one
  gateway call, and counting every one would put a red light on a working
  clinic. See the refund-record rule below.
  **Patient files is the one reconciliation whose
  subject is a medical record.** `patient_medical_documents` holds metadata
  only, so the row and the file in the private `medical-reports` bucket can
  come apart in either direction and nothing looked. They are not the same
  finding: a **record with no file** is red, because it is on the patient's
  own health profile and the view route mints a signed URL for something that
  is not there -- the *patient* meets it; a **file with no record** is amber,
  since nothing is broken for anybody but a scan the patient believes they
  deleted is still stored. It **lists and never deletes**
  (`docs/DATA-POLICY.md` §5, and the steps say so out loud, because the
  obvious reading of an orphan list is "tidy it up"): a sweep that removes a
  file it could not find a row for is one bad query away from deleting a
  patient's scan. A walk that hits its own cap reports *"only part of the file
  store was checked"* rather than a clean bucket it did not earn, and one
  unreadable folder makes the whole answer null rather than an undercount. It
  found two orphans on its first run, and the cause is the ordinary one before
  launch: **the debug reset truncates that table and cannot reach Storage**,
  so every reset since uploads shipped has left its files behind. A `TRUNCATE`
  cannot delete an object in a bucket, so that is a consequence to state
  rather than a bug to fix -- which is what the check's own steps do.
  **The sixth is Public doors, and it watches the limiter rather than a
  backlog.** `enforceRateLimit` allows a request it cannot attribute, which
  is correct and is silent: there is no 429, no log line and no counter row
  to notice the absence by, so a deployment whose host does not forward the
  visitor's address has every public cap switched off and nothing anywhere
  says so. `rateLimitIdentifierStats()` counts what this server has actually
  seen and the check states it. Three things about it are load-bearing:
  1. **The failure that matters is not the one you would test for.** Next
     fills `x-forwarded-for` in from the socket, so a request arriving
     through a proxy that does not pass the original address still carries an
     identifier -- the proxy's. Every visitor then shares one allowance,
     thirty of them exhaust it and the thirty-first is refused for something
     somebody else did, and from the inside that looks exactly like a working
     limiter. So the check reports "every visitor is arriving as the same
     person" as its own state, above a floor of `MIN_SAMENESS_OBSERVATIONS`
     requests because below that it is just a quiet server.
  2. **It is `off`, not `broken`, when nobody can be told apart.** Nothing is
     failing: the app is doing what it was told, and the fix is one setting
     on the host. Red here is how red stops meaning anything.
  3. **The counter hangs off `globalThis`, and that is not a style choice.**
     Next bundles the App Router per entry, so a module imported by both a
     route handler and a page can exist twice in one process. Written as a
     plain module variable the route incremented one copy and the dashboard
     read the other, which never left zero -- the screen said "nothing has
     used a capped page yet" after fifteen requests that had. It holds the
     verdict and never an address: an IP belongs to a visitor, so only
     "one caller or more than one" is kept.
- **A count links to the rows it counted, never to the whole table.** A
  Today figure or queue row that opened an unfiltered list made the reader
  redo the filtering by hand and, worse, made the number look wrong.
  `adminScreenHref(section, tab, view)` adds a third, optional `?view=`
  preset, and the target screen applies it to its own filters on arrival:
  `AdminAllSessionsTab` knows `unassigned`, `today`, `cancelled`, `no_show`,
  `completed`, `home_visit` and `unpaid`; `AdminPayoutsTab` knows `owed` and
  `settled`. Three rules keep it honest. It is **one-shot**:
  `AdminShell.navigate()` deletes `view` on the next tab change, so a preset
  never becomes a filter an admin cannot find the source of, and a repeat
  tap on the same row re-applies it. It **clears the screen's other filters
  first**, since a remembered therapist or date range would hide rows the
  count included - the same "list disagrees with the number" bug in a
  subtler form. And it is applied **during render** (read via
  `useSearchParams`, not at mount): every screen is mounted at once behind
  `hidden`, so there is no mount to hang it on when an admin already on the
  dashboard taps a figure, and an effect would paint the unfiltered table
  first. An unknown preset falls through to cleared filters, so a stale
  link shows everything rather than nothing.
- **A session is listed once.** All Bookings, Session Story, the calendar's
  day panel and the home-visit queue were four lists over the same
  `appointments` rows; they are now one filterable list
  (`AdminAllSessionsTab`) plus the calendar, both opening the same
  `SessionDetailDrawer`. Home-visit specifics (address, travel fee, cash)
  are a panel inside that drawer, not a parallel screen. If you find
  yourself building a second list of sessions, add a filter instead. All
  Sessions remembers its filters per browser (not the date range, which goes
  stale) and paints at most 200 rows before offering "Show all" -- the page
  server-renders every screen at once, so an unbounded table is HTML every
  admin downloads whether they open that screen or not.
- **A person's session list is ordered by the session, not by the booking.**
  The admin's patient and therapist profiles ordered **Booking History** and
  **Assigned Sessions** by `created_at` descending -- when the booking row was
  written, which is also the order `session_code` is handed out in, so the
  list read as being sorted by session ID. A session rescheduled to next month
  stayed wherever it was first booked, which is precisely the case the list
  exists to show. `src/lib/sessionOrdering.ts` is the one answer --
  `slot_time` descending (furthest ahead first, then today, then the past),
  a session with no slot **last** (the column is nullable, and "nulls last" is
  the order `schema.sql` already uses wherever it sorts by slot), and a tie
  broken on `created_at` descending **explicitly**, never by leaning on
  `Array.prototype.sort` being stable. Three details are load-bearing. It is
  applied in `ProfileSessionList`, the one component rendering that list on
  both profiles, so the two screens cannot grow two answers and a third caller
  gets the order without remembering it -- same posture as
  `SessionNoteHistory` and the drawer's reassignment log, which both sort what
  they are handed. An unreadable date is treated as an absent one rather than
  compared as `NaN`, which would leave the array in an arbitrary order with no
  error anywhere. And both queries keep their `.order("created_at")`, now as
  the deterministic input that tie-break reads rather than as a second copy of
  the slot rule to drift from the tested one. **Payment History** and
  **Payout History** on the same profiles stay on `paid_at` descending: when
  money moved is a different axis from when the session was, the same reason
  `refundState` keeps its own. `e2e/admin-profile-session-order.spec.ts` is
  the guard, driven as screens because the routes and the rows are unchanged
  and the order is only visible to somebody reading the page.
- **Every admin export offers CSV and PDF, from one column definition.**
  A call site passes `DataExportButtons` the rows it is already rendering
  plus `CsvColumn[]` - never a pre-built string - so the spreadsheet and
  the printable document can't describe different tables. CSV is still
  built in the browser (no dependency, no round trip); the PDF is typeset
  by `/api/admin/export-pdf` (`src/lib/tablePdf.ts`), which keeps pdf-lib
  out of the admin dashboard's client bundle - that page already ships
  every screen at once. That route reads nothing: the caller sends the
  exact filtered rows it rendered, which is what guarantees the two
  formats agree. Because the rows are the caller's, the route is **scoped
  to the section they came from**: `DataExportButtons` sends the shell's
  current `?section=`, and the route refuses one the caller's scope cannot
  open - any admin used to be able to print a clinic-branded document of
  anything. Every PDF also prints who exported it and a line saying it
  reproduces the screen and is not a statement of account. Give every export a `subtitle` naming
  what the rows are scoped to - a printed table nobody can date is
  worthless. Nothing in the admin dashboard exports JSON, and nothing
  should.
- **The log is a section of its own, and clearing it is the one thing that
  takes evidence away.** Logs (`logs` in `adminNav.ts`) is Master Admin only
  -- `SECTION_ACCESS` gives it to `full` at `manage` and to nobody else -- and
  holds two screens. **All Activity** is every entry with a search, a type
  filter, a date range, both exports and the detail dialog; the dashboard's
  render carries the newest 200 and `/api/admin/activity-log` pages the rest
  **by cursor**, never by offset, since rows are written continuously and an
  offset skips whichever entry crossed the boundary mid-scroll. **Archive &
  Clear** is the only delete path this table has ever had, and five things
  hold it:
  1. **A floor no setting can get under.** `MIN_RETENTION_DAYS` (30) is
     checked in `src/lib/activityLog.ts`, again in
     `/api/admin/clear-activity-log`, and again inside
     `purge_admin_activity_log()`. The database half is not belt-and-braces:
     that function is reachable by the service-role key and by hand in the
     SQL editor, where no route check runs. The newest month of the trail --
     where anything worth hiding would be -- is out of reach at every
     setting.
  2. **The clearing is logged, outside its own reach.** `log.clear` is
     written after the purge, with the cutoff and the count, and now is
     inside the protected window, so a clear can never remove the record of a
     clear.
  3. **A copy comes first.** The Clear button unlocks only once a download
     has actually been produced (`DataExportButtons`' `onExported`), not on a
     checkbox saying one was -- a record that is gone and was never kept is
     destroyed; one downloaded first has only been moved.
  4. **The count is taken server-side**, because the screen holds one page
     and a browser-side count would understate what is about to go.
  5. **Nothing here can be edited, and the screens say exactly that.** There
     is still no update path and never should be. The detail dialog's closing
     line was changed in the same change that added the cutoff -- it used to
     promise entries could never be deleted by anyone, and a screen making a
     promise the product stopped keeping is worse than the feature.
  Adding an action means adding it to `ACTION_DOMAIN` as well as the audit
  union: the type filter is derived from that map, so a second grouping of
  the same 80 actions cannot drift from the one the routes enforce.
  **A subject has a timeline, and it is keyed on the id.** Tapping an entry's
  subject fetches every entry against that `target_id`
  (`SubjectTimelineDialog`), because "what happened to this patient" is what
  gets asked in a dispute and the log was only good at "what did this admin
  do". Matching on `target_label` instead would split a patient renamed
  between two entries into two people -- the label is snapshotted at write
  time on purpose. An entry with no `target_id` is offered no timeline rather
  than one built by guessing, and the dialog's footer says what it is keyed
  on rather than claiming to be everything. One dialog is open at a time:
  opening a timeline closes the entry behind it, since two stacked modals
  over a table leave a reader unable to tell which Escape closes what.
  **So each replacement carries the way back itself.** `Modal` takes an
  optional `onBack` (with its own label), the timeline offers "Back to this
  entry", and an entry opened *from* a timeline offers "Back to this
  record's history". Without it the only exit from a dialog that replaced
  another was closing to the table and finding the entry again -- the cost
  of the one-at-a-time rule, paid by the reader rather than by the design.
  `e2e/logs-subject-timeline.spec.ts` is the guard, driven as a screen
  because nothing here is visible to an API test -- the routes are unchanged
  and both dialogs read the same rows either way -- and it skips itself on a
  log whose entries name no record.
  The way back is a real row, never a re-derivation: `timelineOrigin` holds
  the subject row the timeline was keyed on, because rebuilding it from the
  entry now on screen would open a different record's history. An entry
  opened from the table clears it, so no back button points at a timeline
  nobody came from.
- **An audit write is tried twice, and a write that still fails is not
  lost.** `recordAdminActivity` stays best-effort - the action it records
  has already happened - but a single dropped insert used to be the whole of
  that effort; it now retries once and still reports `false` so a money
  route can return `ACTIVITY_LOG_WARNING`. After the second failure the
  entry goes to `admin_activity_gaps` (minimal, no foreign keys, append-only
  by trigger, cleared by the data reset with the log itself) instead of only
  a server log: System Health's **Activity log** check counts the last 30
  days, and both activity screens list them at the top
  (`ActivityGapsNotice`), so the history says what it is missing rather
  than reading as complete. Changes made while impersonating are recorded under
  the admin as `impersonation.action` (see the impersonation rule in
  `ops-security.md`).
- **An audit entry is read months later, so it says what changed from what.**
  Tapping a row in the Logs section -- or on a limited desk's
  Today -> Activity -- opens the whole entry
  (`ActivityDetailDialog`), and `src/lib/activityDetails.ts` turns the
  route's `details` blob into it. Four rules:
  1. **The before/after pair is found, not required.** Routes name it five
     ways -- `from`/`to`, `fromPercent`/`toPercent`, `oldExpiresAt`/
     `newExpiresAt`, `previousStatus` beside `status`, `before`/`after` --
     because each was written where it was needed. `readableDetails()`
     recognises all five (and `previousPaise` beside `amountPaise`, where
     the stem is only a unit), which is cheaper and safer than rewriting
     twenty routes to agree.
  2. **Nothing is dropped.** An unrecognised key is exactly the one somebody
     is looking for, so unpaired fields are listed plainly and the raw JSON
     stays behind a toggle.
  3. **Values are read, not parsed**: paise as rupees, an ISO stamp as a
     date in IST, a boolean as Yes/No, an absent value as a dash. `Paise` is
     a storage word and never reaches the screen.
  4. **Record the values, not that something changed.** `patient.update_contact`
     wrote `{emailChanged: true}` -- an entry saying a patient's sign-in
     address was altered without saying what it had been is unusable for the
     one question it gets asked. Both contact routes record the old and new
     values now. The exception is free text about a person: the four
     note routes record a **length**, deliberately, because this log is
     readable by every admin and a note about one patient must not be
     reproduced across the back office. A generated password still never
     goes in `details` at all.
- **A profile change is checked by value, and approving it is claimed
  before it is applied.** A request is written by the person it describes,
  through their own token, so `changes` holds whatever they sent; the route
  used to check field names only. `validateProfileChanges`
  (`src/lib/profileChangeValidation.ts`) bounds every gated field - names
  and organisation non-empty and capped, a phone that parses, experience a
  whole number 0-60, a specialty the clinic offers, a real past date of
  birth, a listed gender - and the profile form runs the same check before
  sending. Approval then claims the request (`pending` -> `approved`) first
  and applies it second, releasing the claim if the apply fails; the old
  order left a change live while its request still sat in the queue.
  A partner's **email** is a gated field too, because it is also their
  sign-in: approving it moves the auth login first
  (`auth.admin.updateUserById`), then the profile, and moves the login back
  if the profile write fails - an address already used by another account
  is refused with a 409.
- **Approvals are a queue, not a person.** Pending signups and profile
  change requests live under Today, beside the inbox that counts them, not
  on the patients directory.
- **Approving and declining a signup cannot both land.** Decline deletes the
  account, so it must not read "still pending?" and delete in two steps: an
  approval between them was erased. `decline_pending_account()` locks the
  profile row, checks it is a pending therapist or patient under the lock,
  and deletes the auth user in the same transaction; the route answers 409
  when it was approved meanwhile and never falls back to the old two-step
  path. Approve flips only `approved = false` rows, reports a repeat as
  success, and a declined account as gone. `admin-multi-admin` H-021 races
  the pair in both orders.
- **Admin-configurable behavior** (Meet on/off, join window, the Session
  Completed cutoff - minutes after slot time at which every "Tap to Join"
  control reads "Session Completed" instead, admin's own included, since a
  session an hour past its start reads the same way on every screen it
  appears on - idle timeout,
  booking languages, the online booking lead time and cancellation refund
  window, the package-wide settings - default
  validity, therapist-lock switch, bulk-scheduler limit, expiry reminder
  window - the three recommendation settings on Settings → Programmes &
  Home Visits -
  whether the clinic approves one before the patient sees it
  (`care_plan_requires_approval`, on by default), how long an approved one
  holds, and the ceiling on sessions a week a clinician may ask for - the nine `home_visit_*` settings - master switch, cash on/off,
  lead time, cancellation refund window, default validity, bulk-scheduler
  limit, travel buffer minutes, and the public page's heading/subheading -
  and Brand & Contact Details - site name, tagline, description, contact
  email, WhatsApp number, contact phone, footer copyright text, and the five
  optional social links (`social_*_url`, see `src/lib/socialLinks.ts`, where
  blank means "no icon" rather than a default, and which are read in their
  own guarded call, never through `SITE_SETTINGS_SELECT`) - and the
  Home page walkthrough's per-step rotation seconds, where 0 means "don't
  rotate" - and the mission and vision lines on Settings -> Public Site, where
  blank means "use the wording in `src/lib/mission.ts`", and the promises and
  limits on that same screen, where an empty band means the same - and the
  opening splash's five settings - on/off, the name above
  the line (blank follows the site name), its one line, the hold in seconds,
  and the minutes a tab must be away to earn a second greeting, where 0
  means "first load only" - and the two contact controls,
  `contact_scan_mode` and `contact_masking_enabled`, on Settings → Team &
  Access, and `risk_signals_enabled` with the per-detector thresholds in
  `risk_rules`, on Today → Risk - and `enabled_intake_specialties`, which
  condition types triage offers - and the four invite settings on Settings →
  Offers & Discounts (on/off, what the friend gets, what the inviter gets, and the
  ceiling on rewards one patient may earn) plus `promo_codes_enabled`, whose
  switch sits on Money → Costs beside the campaigns it governs rather than in
  Settings, because an admin who has just written a code and cannot see why
  it does nothing is the failure that placement avoids) is read
  through `src/lib/adminSettings.ts` with defaults - don't hardcode these.
  Every dashboard page must select `SITE_SETTINGS_SELECT` from that module
  rather than its own column list, or a new setting silently reads as its
  default on whichever page forgot it. The root layout is the one place
  that reads Brand & Contact Details (via a public/anon client, so
  ISR-cached pages under it aren't forced dynamic) and passes it into
  `Navbar`/`Footer` as props - those two components take the strings as
  props rather than hardcoding or fetching their own copy.
- **Checkout speed is the one check that measures the product rather than
  a backlog.** The booking wizards time each Pay tap in the browser until the
  Razorpay sheet opens (`src/lib/checkoutTiming.ts`), report once,
  best-effort, to `/api/razorpay/checkout-timing` (signed-in only, its own
  `checkoutTiming` rate-limit scope, every figure re-checked, nothing about
  the caller stored), and `checkout_timings` holds one row per tap. System
  Health reads the last seven days of taps that opened a sheet
  (`readCheckoutSpeed`, isolated, null when unreadable): fewer than ten is
  *Not checked* rather than a verdict, a 90th percentile over six seconds is
  *Needs a look* with the median of each stage as evidence. The table is not
  published to realtime on purpose -- a row per tap would refresh the
  dashboard for every patient paying.
