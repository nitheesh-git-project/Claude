# MoveRestore Physiotherapy

Production Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app
for a physical therapy practice: public marketing site, patient booking and
Razorpay payments across two delivery modes (video consultation and in-home
visits), therapist scheduling and payouts, hospital (B2B) referrals, and an
admin back office. Data, auth, storage, and realtime come from Supabase;
session video links come from Google Calendar/Meet. The admin back office is
organised into seven sections - Today, Sessions, People, Money, Catalog,
Logs, Settings - defined once in `src/lib/adminNav.ts`. Each Settings screen
states in plain words what it is and gives one example, under its own
heading - a label alone names a category rather than an action, and the
section's single line ("How the product behaves") explained nothing about
the screen you had just opened. That is also why the old Booking Rules
screen is three: **Booking Rules** (one video session), **Offers &
Discounts** (money off, to win a patient), and **Programmes & Home Visits**
(more than one appointment, arranged in advance). Its ten screens sit under
four sidebar captions - *Your website*, *How the clinic runs*, *Who gets in*,
*Technical* - because ten flat labels is a list nobody reads top to bottom.
**Sign-in & Security** holds your own password *and* how long everybody else
stays signed in; the idle timeout and the sign-out banner used to sit on
Booking Rules, which is about when a session may be sold rather than when one
ends. **Advanced** is the technical shelf and exists so a data-migration
cutover cannot sit between two rules about how a programme is sold. The two
screens taller than a couple of screenfuls open with a sticky map of their own
sections.

**Logs is Master Admin's alone.** Every action an admin takes is recorded in
`admin_activity_log`, and the Logs section is where the whole of it is read:
All Activity (search, a type filter derived from `ACTION_DOMAIN`, a date
range, both exports, and a dialog on every row saying what changed from what,
with older pages fetched by cursor through `/api/admin/activity-log`) and
Archive & Clear. Clearing is the only way a row has ever left that table, and
it cannot reach the last `MIN_RETENTION_DAYS` - 30 - at any setting, checked
in `src/lib/activityLog.ts`, in the route, and inside
`purge_admin_activity_log()`. It demands a downloaded copy first, a typed
phrase, and it records itself. Nothing here can be edited, and there is still
no update path -- and that is now a trigger rather than a habit: an audit
issued the UPDATE and the row changed, because "no route updates it" was the
whole of the guarantee. `admin_activity_log` keeps DELETE for the purge and
raises on UPDATE; `payments`, `payment_webhook_events` and
`session_note_revisions` got the same treatment in the same change, each
permitting only the one mutation it legitimately needs
(`scripts/append-only-sql-checks.sql`). Operations, Finance and Clinical cannot open Logs; they read
their own desk's work on Today → Activity. See the log rule in `AGENTS.md`.

**Every public door is rate limited, in Postgres.** Nothing was throttled
across 173 routes -- an unauthenticated lookup returning a referred patient's
name and medical issue, hospital code enumeration, and two public inserts with
no ceiling. `src/lib/rateLimit.ts` names the limits, `rateLimitServer.ts`
enforces them and `check_rate_limit()` counts, in the database because this
deployment has no worker and an in-memory counter would reset on every cold
start. It is a fixed window with no expiry column (a row recording the passage
of time would need a sweep), counted by insert-on-conflict so a cap holds under
concurrent requests, keyed on the account where there is one because an IP can
be rotated, counted **after** the request's shape is checked (the count costs
a round trip; the validation costs a regex), and it **fails open** -- a limiter
that refuses a booking because its own query hiccupped is worse than the burst.
A 429 is never a "no": two callers read `valid` and `serviceable` off one and
told a patient their good registration link had expired and that the clinic
does not visit their address, so both resolve a third "could not ask" state
now. The Hospitals page's lead form
moved behind `/api/hospitals/inquiry` for the same reason: a browser-side
insert has no door to put a limit in. Every POST body is read through
`parseJsonBody`, so a malformed one is a 400 rather than the 500 that 45
routes -- both Razorpay routes among them -- were answering with. Sign-up and sign-in go straight to
Supabase Auth, so their limits live in the Supabase dashboard. See the rate
limit rule in `AGENTS.md`.

**Every server-side Supabase call goes through one bounded `fetch`.**
Node opens a socket per request and will open thousands: the admin dashboard
fires ~82 queries a render, so 40 concurrent admins was ~3,300 requests at
one origin, the TLS handshakes timed out, and the dashboard's own isolated
guards rendered the missing rows as zeroes -- fifteen renders answered
HTTP 200 having silently lost the appointments table, which is every money
figure and every queue count on that screen.
`src/lib/supabase/resilientFetch.ts` caps in-flight requests
(`SUPABASE_MAX_IN_FLIGHT`, 96, measured -- 48 was eight times *slower*, 192
no better), deadlines each one (`SUPABASE_REQUEST_TIMEOUT_MS`, 20s), and
retries a GET once on a transport error but never a write. `AdminDataLoadBanner`
is the other half: a read that failed now says so on the screen instead of
rendering as a read that came back empty, and the two routes that reported an
unreadable `home_visit_enabled` as "home visits aren't available" answer 503
"we couldn't check" instead. Settings -> System Health carries a sixth check,
**Public doors**, for the limiter's own silent failure: a request nobody can
be told apart from is allowed, so a host that forwards its own address rather
than the visitor's leaves every public cap either off or shared between
everybody, with no 429 and no log line to notice it by. See the transport
rule in `AGENTS.md`.

**A refund records what it is about to do, before the money moves.** Every
gateway refund here claims its local row first and calls Razorpay second, so
a refusal leaves no trace claiming money went back -- and every one of these
routes reverts its claim when Razorpay says no. The opposite failure had
nothing watching it: Razorpay accepts the refund and the write recording it
fails, which leaves the money gone, `refund_id` null, and the session
indistinguishable from one that was claimed and never sent. All four refund
writers had that window and in all four the only thing that noticed was a
`console.error`, which is not a place a clinic owner looks. `refund_attempts`
(`src/lib/refundAttempt.ts`) is the record, written **first**: a row lands as
`processing`, the gateway is called, and the row resolves to `succeeded` with
the gateway's own refund id or `failed` with what it said. A refund that
cannot be recorded is **not attempted** -- the three admin routes put their
claim back and answer 503 -- with `cancelAppointmentAndRefund` the one
exception, since its cancellation is already committed and its slot
legitimately freed, so it records a failed refund instead, which is already a
pinned item on the patient's own feed. Resolving never throws: by then the
money has moved, and a row left at `processing` is exactly what Settings ->
System Health -> **Refunds**, the ninth check, exists to name. It asks two
different questions -- a refund sent whose answer was never recorded, and a
refund the gateway accepted whose session or purchase carries no id -- and
reports, never repairs. The table is append-only by trigger with every
foreign key `restrict`, because `set null` is an UPDATE the trigger refuses
and `cascade` would destroy the record of money moving. See the refund-record
rule in `AGENTS.md`.

**Suspension reaches the database, not only the app.** `profiles.active` is
read by `src/proxy.ts` and `requireActiveProfile`, and both are this
application -- a session cookie reaches PostgREST without passing either, and
Supabase keeps rotating the refresh token, so flipping the column alone left a
suspended admin reading every patient record indefinitely. `is_admin()`
refuses a suspended admin now, all eighteen admin policies that inlined their
own copy of that check call the function instead, and the four `set-*-active`
routes end the account's sessions through `revoke_user_sessions(uuid)`. The
same reasoning covers the functions themselves: a `security definer` function
must be revoked from `public`, `anon` and `authenticated` -- naming only the
last two leaves PUBLIC's implicit grant, which is how `record_payment_capture`
and `grant_session_credits` came to be callable by anyone with the publishable
anon key. See the three grant rules in `AGENTS.md`.

An admin carries a scope (`full`, `operations`, `finance`, `clinical`) that
decides which of those sections they open **and at what level** - `none`,
`view` or `manage`, with `requireAdminScope` asking for `manage`, so a
section granted at `view` is read-only at every admin route rather than only
where a screen remembered to hide a button. Finance reads Sessions on
exactly that basis. Settings → User Access is where the model is read: the
back-office directory plus a matrix of what each desk can do, derived from
`src/lib/adminScope.ts` so it can never claim access nobody has, and
deliberately not a set of switches. It is also where access is taken away -
suspending, never deleting, because an admin's id is on every audit row they
wrote. **Each scope opens on its own
Today screen** - decided once in `src/lib/adminHome.ts`, never in the page,
so four dashboards cannot grow four answers to "what needs me today".
Operations leads with unassigned sessions, finance with what is owed to
therapists, clinical with the recommendations a patient is waiting on; a
full admin's screen is unchanged. Every link that module produces is built
through the scope check, so an action for a section this admin cannot open
is dropped rather than rendered - `findTab` would redirect the tap somewhere
else and the dead link would look like it worked. "Needs you" counts only
the queues the viewer can **work** - a section they can only read holds no
work for them - so it agrees with the list beneath it, and
ordering those queues by role is emphasis, never permission: nothing
reachable is hidden. Every dashboard names itself - `Master Admin`,
`Operations`, `Finance`, `Clinical` - in the sidebar brand and again above
the section heading, so nobody has to infer which of the four they are on
from which entries are missing; a limited scope also gets a "Your access"
card saying which sections that name covers, because a shorter sidebar with
no explanation reads as a fault. See the scope rule in `AGENTS.md`.

The mission and the vision are an admin setting
(`site_settings.mission_statement` / `vision_statement`, Settings -> Public
Site -> Mission & Vision), not two constants only a developer can reach. Blank
means "use the wording in `src/lib/mission.ts`", so clearing the box is the
undo and a database without the migration renders what it always did; the
lines are read in their own isolated call (`readMissionCopy()`), falling back
to that wording rather than to a blank card, and saving invalidates `/` and
`/mission` so the new sentence is not five minutes behind the save. The four
promises and the three limits are editable the same way, as rows in
`mission_principles` with one manager serving both bands: an empty table falls
back per band to the arrays in `src/lib/mission.ts`, every row switched off is
respected and drops the band along with its section-rail entry, ordering is one
save of the whole band through `set_mission_principle_order`, and the icon is a
picker rather than a text box. See the two mission rules in `AGENTS.md`.

The public marketing site is eight pages - `/`, `/conditions`,
`/how-it-works`, `/home-visit`, `/team`, `/mission`, `/faq`, `/hospitals` -
defined once
in `src/lib/marketingNav.ts` and assembled from one shared, photo-led design
system in `src/components/marketing/`. The home page scrolls down into a
connector grid linking every other page plus booking; the other six end in
the same grid minus themselves. Photographs are static imports registered in
`src/lib/marketingPhotos.ts` and live under `public/photos/`. Catalog
covers (programmes and packages) are admin **uploads** instead, held in the
`catalog-images` bucket and positioned by `image_focal_x` / `image_focal_y`
rather than cropped - one position is correct in the card's 4:3 and the
dialog's 16:9 alike. They fall back to `CatalogImage`'s shared placeholder.
The home page leads with **four** conditions rather than listing every one,
with the rest a tap away on `/conditions`; `/home-visit` does the same and
reveals its own remainder in place, since it is already the full list. Which
four is an admin's choice - a tick on each row's own screen, never computed
from sales, because a home page that rearranges itself when a booking lands
changes without anybody deciding. `src/lib/catalogFeatured.ts` holds the
rule, and with nothing ticked it falls back to the first four, so the band is
never empty.

One component, `CatalogCard`, renders every offering the clinic sells - the
public programme and home-visit cards, the patient dashboard's booking
screen, which was a text-only list, **and** the two public booking wizards -
and `CatalogDialogHeader` gives both detail dialogs the same header,
photograph uncovered with the heading on its own band below.

**And the patient chooses what they are buying before they choose when.**
Both public wizards asked for it from a native `<select>` of one line per
option - `/book` in Step 2, *after* a date and an hour had been picked while
the header still read "pricing shown once you pick a concern", and
`/book-home-visit` in Step 3, where with one sellable package it did not
render at all and the patient reached the payment screen never having seen
what they bought. It is the first block of Step 1 on both now, through
`ServicePicker` (`src/components/booking/ServicePicker.tsx`): a trigger card,
then **one** dialog that swaps between a grid of `CatalogCard`s and a
`CatalogDialogHeader` detail view with a way back - never a second dialog
stacked on the first, which the public `Modal`'s own `backdrop-blur-sm` would
position against that panel's box rather than the screen. The rows are mapped
by `src/lib/serviceOptions.ts`, the picker offers only what
`isDirectlyPurchasable` allows, and with exactly one option there is no
dialog at all: it is stated as chosen, with its photograph and its price.
Continue appears once a service is chosen, the same way Step 1 has always
waited for a date, an hour and a language.

**One atomic claim reserves a therapist, and every booking path uses it.**
Six paths each did it as a read, a write and at best a re-read with a
hand-rolled revert -- which cannot stop two requests both passing the check
before either write lands, and whose revert rewrote `therapist_id` with no
compare-and-set, so a third admin's assignment could be stamped over by a
request that had already lost. `claim_therapist_slot()` does the overlap test,
the compare-and-set and the write in one transaction under a row lock on the
therapist; `claim_therapist_referral_slot()` is the sibling for a referral
holding a slot before any appointment exists. The revert branches are gone
because there is no window to revert from, and the deterministic referral
tie-break went with them -- it only ever existed because two writes were never
serialised. **And the revenue split is frozen when the work is delivered**:
`therapist_share_percent_at_completion`, `hospital_share_percent_at_completion`
and `hospital_id_at_completion`, so renegotiating a rate no longer rewrites
every figure somebody has already been invoiced on. Purchased terms -- the
session length, the minimum gap, the weekly cap -- read
`session_entitlements.package_snapshot` through `readPackageTerms` rather than
the live catalogue row, so an admin editing a programme no longer changes the
rules under a patient part-way through one. See `docs/MONEY-MODEL.md` and
`docs/audit/AUDIT-FIX-REPORT.md`.

- `README.md` - product overview, setup, environment variables, routes, and
  how each flow works.
- `AGENTS.md` - the working rules for editing this codebase (imported below;
  follow it in full).
- `supabase/schema.sql` - the entire database schema, RLS policies, views,
  and triggers. Single source of truth, re-runnable, append-only.

**The debug bar stays switched on, in every environment, until launch.**
This app has no real patients yet. `isDebugNavVisible()`
(`src/lib/debugNavVisible.ts`) is the single source of that rule: on unless
`NEXT_PUBLIC_SHOW_DEBUG_NAV` is exactly `"false"`, so `next dev`,
`next build` + `next start` and the deployed site all show it. Do not gate
it back behind `NODE_ENV`, do not hide it "because production", and do not
re-inline that expression at a call site. The owner removes it by hand
before going live - and removal means deleting the bar, since the flag is
public and the bar names `/admin/login` and `/admin/dashboard`. The
database-wipe flag (`ALLOW_DEBUG_DATA_RESET`) is a separate, server-only
thing and stays unset.

**Nothing the browser draws itself speaks to a person.** A blank `required`
box used to be answered by the operating system's own grey tooltip, which is
the one piece of UI here nobody designed - it arrives with the attribute,
reads like a form from 2005 and looks different on every browser.
`FormValidationChrome`, mounted once in the root layout, suppresses it and
renders the clinic's own message anchored to the field with a red ring on
it; the wording is `src/lib/formValidationMessage.ts`, which names the field
from its own label and says what an acceptable value would look like. It is
one listener at the root rather than an edit to every form, so a form nobody
has touched - including the next one written - is covered. `window.confirm`
is the same rule one control over and `useConfirm` is its replacement. See
the browser-defaults rule in `AGENTS.md`.
**A number box takes digits too.** The browser's own `type="number"` accepts
`e`, `E` and `+`, then reports the box as empty - which is what made the
condition form's Order field take one letter and refuse the rest.
`NumericInputGuard` is the other root listener, reading each field's own
`step` and `min` so a price keeps its decimal while a count does not, and
the two treatment-category routes refuse an order that is not a whole
number of 0 or more. Order itself now says what it decides: where the
condition sits in the list, lowest first.
**And a date is picked from the clinic's own calendar, everywhere.** The third
of these, and the largest: twenty-eight `<input type="date">` and
`datetime-local` boxes - every report filter, the promo window, a document's
date, the roster's exceptions and leave - handed the choice to a panel the
browser draws, which looks and reads differently on every browser and every
phone. `DateField` (`src/components/system/DateField.tsx`) opens the app's one
month grid instead: the same `BookingCalendar` that books a session, taught an
optional `bounds` so it can offer a past date, with `src/lib/dateFieldValue.ts`
emitting byte-for-byte what the native inputs emitted so no query, parse or
route body changed. `src/components/DebugNav.tsx` is the one exemption, and
`nativeDateInput.test.ts` walks `src/` for the next one.

**A tap is acknowledged, and a screen already on the page is not fetched
again.** Tapping a Today count used to be an ordinary link to
`/admin/dashboard?section=...`, which rebuilt the whole dashboard from ~49
queries to show a screen already in the DOM - seconds of silence, then a
jump. `AdminScreenLink` hands those to the shell's own navigate, so they
switch in place as the sidebar does, and `LinkProgress` (one listener in the
root layout) draws the teal bar for every other link in the app, whoever
wrote it. See the navigation rule in `AGENTS.md`.

**And a button is never dead while something else loads.** The booking
wizard's pay button was disabled for the length of the price read that fires
on arriving at Step 3 and again on every promo code applied, so the one
control that screen exists for sat unusable for a round trip with nothing on
it saying why - which is indistinguishable from a broken button, and a
patient who taps a dead pay button taps it again. The tap is **queued rather
than refused** now: it is acknowledged the instant it lands, waits for the
figure inside the handler, and branches on the answer that arrives rather
than the one it replaced. The read's own flag stays, as a line saying the
price is being checked - the wait is stated, never enforced. A control may
still be disabled by **its own** request (Apply reading "Checking...") or by
a validity gate; it may not be disabled by a read it did not start. See the
disabled-control rule in `AGENTS.md`.

**A patient's or therapist's own page is the dashboard, not a page that
looks like it.** Those details are an overlay over whatever screen you were
on, and a reload, a new tab, a shared link or a refresh lands on the real
route instead. That route used to wear a reduced frame -- same rail, no
badges, no search -- which read as being thrown out of the back office onto
a plainer site, and it was reported from the one flow that refreshes:
reassigning a session from a therapist's profile. It renders the dashboard
itself now (`AdminDetailDashboard`) with the same overlay on top, and
closing is a URL change rather than a rebuild of a screen already on view.
See the intercepted-overlay rule in `AGENTS.md`.

**And the sessions on that page are listed by when they are, not by when they
were booked.** Booking History and Assigned Sessions were ordered by
`created_at`, which is the order session codes are handed out in -- so the
list read as being sorted by session ID, and a session rescheduled to next
month stayed wherever it was first booked. `src/lib/sessionOrdering.ts` is
the one answer: the session's own `slot_time`, newest first, a session with no
slot agreed yet last, ties broken on the booking time. It is applied in the
one component that renders that list on both profiles, so the two screens
cannot disagree. The money lists beside it still run by when the money moved.
See the session-order rule in `AGENTS.md`.

**And every account says when it was created, with the time on it.**
`profiles.created_at` was the date alone on the patient and therapist detail
headers, date and time on the People directory, and absent from the Partners
card and the approvals queue although both queries had always selected it.
One helper now, `formatClinicDateTimeWithZone` -- the old `formatIST.ts`
folded into `formatDateTime.ts`, keeping the `IST` suffix because this is the
one figure read down a phone line rather than off the screen it is printed on
-- on all of those plus each role's own Edit Profile screen, through
`AccountCreatedNote`. It shows nothing rather than a dash when the stamp is
missing. See the account-stamp rule in `AGENTS.md`.

**An account is deleted only when nothing points at it, and what points at
it is asked of the database.** The route kept a hand-written list of the
columns that refuse a delete; 35 foreign keys into `profiles` block one and
the list named 13, so for the rest the screen offered a delete the database
then refused with "did not say why". `account_blocking_references()` reads
`pg_constraint` instead, so a table added tomorrow is counted the day it
arrives. Underneath that sat a second fault: the Master Admin guard ran as
its caller, and the caller for a delete is GoTrue's own role, which cannot
read `profiles` -- so **no admin account could be deleted at all**. It is
`security definer` now. And a third: the counter asked about `profiles` while
the delete removes the `auth.users` row, so anything pointing at **that** --
`storage.objects.owner`, which every account with an uploaded avatar carries --
refused while the screen reported nothing in the way, which is the "did not say
why" sentence back again. It counts both tables now, uploaded files get their
own word, and `admin_delete_account()` names the table and constraint that
refused instead of handing back GoTrue's empty 500. See the account-deletion
rules in `AGENTS.md`.

**Marking an out-of-area request served offers to open the area.** The
waitlist is demand the clinic turned away, and tapping *served* used to move
a word while the pincode stayed unserved - so the next patient from that
street met the same refusal. It asks first now, prefilled from the request
and from what the clinic already charges in that city, with two answers:
open the area and mark it served, or mark it served alone. See the waitlist
rule in `AGENTS.md`.

The health profile is **per specialty**: a condition profile carries
`specialty` (`ortho`, `neuro`, `pediatrics`), and that decides its seven
questions, its summary card, its snapshot figures and its progress line.
A therapist triages the patient at first contact and writes the first
record - needing only assignment, and going live with no review - and that
fill is what unlocks the patient's own access to it. The Pain Map is an
orthopaedic layer and stays one; the other two exam layers are explicitly
deferred. See the "Patient Care Intake and Pain Map" rule in `AGENTS.md`.

Patient files (avatars, and the test reports and scans patients upload to
their health profile) live in Supabase Storage, never in a table column -
`patient_medical_documents` holds metadata only, and its bucket is private.
The patient's own record leaves the app as a PDF named
`Name_PatientCode.pdf` (`src/lib/healthProfilePdf.ts`), not as JSON.

Before writing code: read the relevant guide in `node_modules/next/dist/docs/`
- this Next.js version differs from training data.

Therapist availability is three things and reads as three things: a
**weekly schedule** (what someone normally works, as working periods rather
than hourly cells), **exceptions** (a date that differs), and **time off**
(off the roster entirely, `profiles.on_leave`). One editor serves the
therapist's own screen and the admin's Roster, which opens on a list of
therapists rather than a calendar date and an eighteen-column grid. The
storage model behind it is unchanged -- `src/lib/availabilityRanges.ts`
converts between periods and the hour rows the tables have always held. The
roster is the clinic's planning record; it does not filter the patient's
booking picker, and availability never touches an appointment. It **reads both
ways round**: Therapists, or a Day view answering "who is free on Thursday, and
which of their hours are taken" - one date against every therapist, which
nothing in the app joined before (`src/lib/rosterDay.ts`, composing the same
`computeDayAvailability` rather than re-deriving it, and read-only like the rest
of the roster). The schedule **opens read-only with an Edit button**, so reading
somebody's hours and changing them are no longer one act. And a therapist who
has never been saved asks for no compare-and-swap: a missing
`therapist_schedule_state` row is `null`, not version `0`, which is what made
the *first* save for every therapist answer "this schedule was changed by
someone else". See the "Nobody edits an hour" rule in `AGENTS.md`.

A therapist carries a **specialisation**, and it is a value rather than a
sentence: the eight the clinic recognises live in
`src/lib/therapistSpecialties.ts`, the column stores the canonical label
("Orthopaedic", never "ortho"), and free text written before that list
existed still renders exactly as its author wrote it and files under
"Something else". It is asked for on the public application form and on
User Access's create-account form, editable by the therapist through the
ordinary admin review, and shown wherever that therapist is -- /team and the
booking wizard's requested-therapist card, the admin's therapist directory,
detail page, roster and approvals queue, and every picker that assigns one.
People -> Therapists carries a **filter by specialisation** built from the
people on screen, so an option matching nobody is never offered. Nothing is
shown for a therapist who has not said: a chip reading "Unknown" on every
such profile is a label on an absence. See the specialisation rule in
`AGENTS.md`.

Nobody is admitted to a session by hand. Meet's default access admits only
signed-in Google users who are on the invite and makes everyone else knock,
which for patients registering with whatever email they have meant both
parties waiting for the clinic's own Gmail account to let them in. Each new
session's meeting is switched to open access right after its Calendar event
is created (`src/lib/googleMeetSpace.ts`, the Meet REST API's
`meetings.space.settings` scope). A failure never invalidates the session --
the link works, the meeting just keeps its waiting room -- and lands on
Settings -> System Health -> Waiting Room with an "Open the door" button and
a bounded automatic retry. Whether the Google account is connected **at all** is its
own panel on that screen (`src/lib/googleConnectionHealth.ts`), because one
dead refresh token fails every session identically and used to read as a few
unlucky ones; that panel also states the length, an eight-character
fingerprint and the surrounding-whitespace state of the token the server is
holding, plus the Google app it is presented to, since `invalid_grant` is the
same answer for a dead permission and for a deploy still running the old
value; the retry sweep stands down while it is down rather than
spending each session's capped attempts. Whether a given session is synced is
`src/lib/meetSyncState.ts` -- a home visit has no Meet link by design, so
judging it by one listed every home visit as broken and made Retry mint a
duplicate calendar event per click. Open access removes the knock, not the sign-in: a meeting
organised by a personal Gmail account still requires a Google account to
join, and only moving the organiser to Workspace changes that. One switch,
`meet_open_access_enabled`, on by default.

A paid session is assigned automatically when **exactly one** therapist is
unambiguously free for it -- rostered that hour, approved, not on leave and
with no clashing session -- or when the patient's own requested therapist is
among the free ones (`src/lib/autoAssignTherapist.ts`, called from both
payment-confirmation paths). Anything less certain leaves the session in the
admin's queue exactly as before. It is one switch
(`auto_assign_therapist_enabled`, off for its first release) and it does not
change what times a patient is offered: the roster still does not filter the
booking picker.

**And approved is not the same as ready.** `profiles.approved` means a person
vetted the account, and the product read it as "ready to be assigned" -- so a
therapist could be approved with no hours on the roster and no revenue share,
both of which fail *silently*: nothing can offer them a session, and a session
they do deliver leaves them owed nothing with no screen saying why.
`src/lib/therapistReadiness.ts` is the five things this app itself needs, and
it is a **derivation rather than a column**: a `production_ready` flag
somebody ticks is a second source of truth that drifts from the facts it
describes. It is **advisory for a person and binding for the machine** -- an
admin assigning has the therapist in front of them and nothing here disables a
control, while the automatic assigner, which picks somebody with nobody
watching, refuses a therapist with no roster or no rate. It does not refuse
over a missing specialisation: that costs a patient a sentence on a profile
page rather than making an assignment wrong. A ready therapist gets no panel
at all, the same rule an unrefunded session's missing refund chip follows.
Leave is not on the list -- a therapist on leave is not *unfinished*. See the
readiness rule in `AGENTS.md`.

Session credits live in an append-only ledger (`session_credit_ledger`)
over `session_entitlements`, not in a mutable counter. Every movement goes
through a database function holding a real row lock, keyed for idempotency
on the appointment or payment that caused it, and
`verify_entitlement_balances()` reports any disagreement on Settings →
System Health → Books & Sessions Agree. Whether balances are read from the ledger or from the older
counters is one admin switch (`entitlement_ledger_authoritative`), off by
default and reversible without a release - on **Settings → Advanced**, the
technical shelf, rather than beside the rules deciding what a programme is:
a data-migration cutover whose own help text sends the reader to System
Health is not a decision the clinic can take by preference. Admins can change any balance - grant, reverse, revive, all
with a mandatory reason - and cannot change any history.

An admin can write a recommendation on a therapist's behalf when that
therapist cannot reach their dashboard - same rules, same package whitelist,
programmes narrowed to that session's own condition, attribution stated at
the button, attributed to the clinician (`authored_by`) and recorded as typed
by the admin (`entered_by`) - and can withdraw one. They can also approve a
queued one with different numbers, which is the same thing again: a new
version through the same function, never an edit of the clinician's. All
three doors call `authorCarePlanVersion()`, and none of them can set a
price.

A therapist recommends treatment after a session as a **care plan**
(`care_plans` + append-only `care_plan_versions`), written from the session
note dialog. They answer two questions - which condition, and how many
sessions - and those two select exactly one admin-configured package. There
is no price, session count or discount column for anyone to set. Plus four
clinical fields. It needs a completed session they ran, and a purchased plan
is never re-versioned: a later recommendation opens a new thread. The same
rows render on the therapist's chart and the patient's Health Profile.

**The clinic approves it before the patient sees it.** A submission lands
`pending_review` and shows on Sessions → Recommendations, counted in Today's
inbox; an admin approves it in one tap, turns it down with a reason the
therapist reads, or approves it with different numbers - which writes a
*new* version attributed to the clinician and entered by the admin rather
than editing theirs, since versions are append-only. Decisions are recorded
in append-only `care_plan_reviews`; a reason is required only for the two
that take something away. Approval re-checks the live catalogue first, so a
stale offer is caught by the admin rather than by the patient's refused
payment, and the offer window is stamped at approval rather than at
authoring so a plan that waited does not reach the patient with its time
already spent. The queue is oldest-first and aged in words. One
switch, `care_plan_requires_approval`, on by default and failing closed.

The patient answers on **Suggested Sessions**, which also carries the
therapist-proposed times that used to live on Overview alone; accepting
re-derives the price server-side, refuses on a catalog mismatch, and grants
exactly the recommended sessions.

**Paying ends in booked appointments, not a balance.** The payment lands on
a confirmation and one next step; the scheduler opens with the whole run
already proposed from the clinician's own cadence
(`src/lib/sessionRhythm.ts` - a proposal only, re-checked server-side); and
anything still unbooked stays a `needsYou` item on the patient's dashboard
until the balance is spent. The patient's word for all of it is
**programme**.

A patient's first purchase is **one session**. A multi-session programme is a
clinical judgement, so it comes from a care plan and never from a price list:
`src/lib/consultationFirst.ts` allows direct purchase only of a single
session or visit, and the old `/book?package=` checkout is deleted. A
one-visit home package is the home-visit consultation and stays purchasable -
without it, a patient who needs to be seen at home would have no entry point,
since ordinary consultations are always video.

**Nor is a programme advertised.** The public pages carry no programme
catalogue at all: `/` and `/conditions` show treatment categories and their
consultation price, `/home-visit` shows single visits only, and the
`show_programme_prices` switch is retired rather than defaulted off - a
toggle somebody can flip back on is not the rule being gone, and its column
is dropped rather than left behind for the reset function to keep resetting. The patient
dashboard's booking hub is the same: one video consultation, or one visit
at home.

**A few long-standing patients pay after their treatment, not before.** An
admin creates the account, hands over the credentials and ticks **Pay later** on
the profile -- `/api/admin/set-patient-pay-later`, `requireAdminScope("money")`
because extending credit is a money capability whatever screen the button sits
on, with a ten-character reason to grant and none to stop, refused for a
hospital-referred patient (a partner earns a share the moment a session is
delivered, so terms would pay it out of money nobody has been given), and
behind one master switch, `pay_later_enabled`, off for its first release and
read in its own call failing **closed**. Stopping a patient's terms stops new
bookings only: sessions already booked keep them, and anything already owed
stays owed, listed and settleable. That patient books an online session through the ordinary wizard --
`/api/appointments/confirm-pay-later`, the sibling of `confirm-free`: no
gateway, no `payments` row, `payment_status` left `unpaid` and `paid_at` never
stamped, with eligibility re-derived server-side because the browser sends an
appointment id and nothing else. Online only, never against a programme, and
never when a discount already took the total to nothing -- a free booking is
not a debt of zero. The price is **frozen inside the same claim that
confirms**, so no row is ever half-booked, and the route returns the figure it
wrote rather than a re-read. Paying now is still offered beside it: switching
this on for somebody must not take away a choice they had. They pay
nothing, and owe
nothing until the session has actually been delivered. On completion the frozen
price appears in three places at once -- what they owe, the clinic's revenue,
and the therapist's share, which is deliberately **not** made to wait on the
patient: they did the work and had no say in extending the credit, so the clinic
carries the gap. `appointments.payment_terms` is the new axis because
`payment_status = 'unpaid'` already means "abandoned checkout", and telling those
two apart is what stops an abandoned cart being counted as a debt. The money is
read on **Money -> Owed by Patients** (`src/lib/patientBalances.ts`), which leads
with the total and the age of the oldest unsettled session -- there is no ceiling
on what a trusted patient may owe, so those two figures are the entire early
warning. How long a balance may sit before it counts as worth chasing is the
clinic's own (`pay_later_aged_after_days`, 60 days by default, set on that same
screen beside the figure it colours, with a live count saying how many patients
that number would flag before it is saved): it is the only automatic warning the
feature has, and a clinic settling weekly needs a different number from one
settling quarterly. Whether it warns at all is a switch
(`pay_later_age_warning_enabled`, on) rather than a zero in that number, because
zero reads as "chase everything" to one person and "never warn me" to another;
off means nothing turns amber and the Today alert counts zero, while every total
still shows. A stored number the app cannot use resolves to the 60-day default
and the screen **says so** rather than quietly disagreeing with its own
database, and a desk that cannot change the setting reads the rule in a sentence
instead of meeting a gap where a control should be. Seven guards ship with the privilege and **before** anything can use it,
because each one would otherwise make a working feature read as broken: the
risk detector and System Health both stop counting a session on terms as
unbacked (it is backed -- the debt is recorded and has its own screen),
`complete-session` gains a fourth allowance (completing is precisely what
creates the debt, so refusing would make the one session that must be closed
the one that cannot be), assignment confirms on terms (or it never reaches
`confirmed` and can never be completed), the therapist's card stops telling
them to collect cash at a video call, the patient's feed stops saying their
booked session "isn't booked", and every chip reads `src/lib/sessionPaymentState.ts`
rather than printing `payment_status` raw -- "Unpaid" against a patient of two
years is both wrong and, on the screen an admin chases people from, actively
misleading. The patient reads the same session in their own voice
(`describeSessionPaymentForPatient`): **"Written off" never reaches them** --
it is the clinic's word for a debt it stopped chasing, and on their own card it
reads as having been given up on, where what is true for them is that there is
nothing to pay -- a cancelled session on terms says nothing at all, and their
card no longer offers a Pay Now button that `create-order` refuses anyway.
**They settle from a pool.** The patient's dashboard carries what they owe,
each session at the price agreed on the day, and two ways to pay: online,
which `record_payment_capture` confirms and allocates in one transaction, or a
**declaration** (cash, UPI, bank transfer) that lands `pending` and **settles
nothing** -- the figure does not move until an admin confirms the money
arrived, because a patient who could clear their own total by typing into a box
is a patient who can. `pay_later_payments` is the pool;
`allocate_pay_later_payment()` covers delivered sessions **oldest first, whole
sessions only**, under a row lock on the patient, and writes
`amount_paid_paise = amount_due_paise` **exactly** -- never the payment's share
-- which is what makes every money figure and every therapist's pay identical
either side of a settlement. The pool is fungible across payments, so two part
payments close a session between them rather than stranding money for ever. One
receipt per payment, listing the sessions it closed, because four receipts for
one transfer reads as four payments. Confirming is one tap and rejecting needs
a ten-character reason the patient reads. System Health carries a seventh
check, **Pay Later**: owing money is never a fault, a payment waiting to be
checked is amber, and the only red is the money in disagreeing with the money
accounted for -- reported, never repaired. Risk carries three rules of its own
under **Trusted patients -- follow up**. **And money that never arrives is a
cost, not a reduction.** Writing a session off
(`/api/admin/write-off-pay-later-session`, money scope, a ten-character reason
both ways because reversing re-imposes a debt somebody was told was forgiven)
moves no money column on the appointment -- the clinic delivered the session,
counted the revenue and has already paid the therapist, so reducing the amount
would claw back money already handed over. `pay_later_outcome` takes it out of
the owed figure and the loss is one **Bad debt** row on Money -> Costs, tied to
the session by `business_expenses.source_appointment_id` and its partial unique
index; the appointment is claimed first and a cost row that will not write
reverts the claim, since a write-off with no cost behind it overstates profit by
exactly the amount forgiven. **A refund on a session they had already settled is
handed back by a person**: the money arrived into a pool covering several
sessions, so it takes the `manual_pending` lane and waits under *Refunds to hand
back* on the same screen -- and refunding one they have **not** settled is not a
refund at all, which the route says rather than dead-ending. See the pay-later
rule in `AGENTS.md`.

**The books answer the seven standard questions too.** Money -> Business
Health reports return on investment, return on ad spend, working capital,
gross and net margin, EBITDA, break-even and revenue run rate, off one
dependency-free module (`src/lib/financeMetrics.ts`) reading the same revenue
split Summary does. Every figure carries its formula and where each input
came from behind its (i), and a figure that cannot be worked out is a
sentence naming the missing input rather than a zero. Three inputs cannot be
derived and are typed in on **Money -> Your Numbers**: what was invested
(with a life in months, which is what produces the depreciation and
amortization inside EBITDA), advertising spend per campaign, and a dated
snapshot of what the clinic owns and owes. Interest and tax are ordinary
costs on Money -> Costs, where every cost now carries a **kind**
(`cost_class`) deciding whether it sits above or below the gross-profit line,
inside break-even's fixed costs, and whether EBITDA adds it back. An ad
campaign's revenue is traced by promo code or not at all -- untraceable spend
is stated, never divided into -- and working capital counts sessions patients
have paid for and not had as the liability it is. See the Business Health
rule in `AGENTS.md`.

**And a purchase nobody ever booked anything against is a phone call.** The
one state where the clinic had taken a decision from a patient and delivered
nothing at all had no row anywhere: the balance was on their Programmes
screen and unbooked sessions were pinned to their own dashboard, so every
mechanism pointed at the patient -- who is exactly the person who had already
stopped. `src/lib/unscheduledPurchases.ts` is the judgement, dependency-free
because it decides who gets rung: still active, money **committed** (paid, or
a home visit agreed at the door, since a cash purchase is `unpaid` for its
whole life by design), nothing booked **ever** rather than "has sessions
left", and past a 24-hour grace window so a purchase on its way to the
scheduler is not a fault seconds after it is made. It sits on Money's alert
strip as *Paid programmes with nothing booked*, deliberately **not** urgent
-- nothing has gone wrong and nobody is out of pocket -- and links into
Catalog -> Purchases with a *Nothing booked yet* filter, which is a different
question from the *Has unscheduled sessions* checkbox beside it. That strip
is work waiting on somebody and System Health is records disagreeing; a new
finding goes on whichever it actually is, and never on a third screen that
would be a third answer to "is anything wrong".

Four acquisition discounts exist and no more (`src/lib/discounts.ts`,
`promoCodes.ts`, `inviteRewards.ts`), recorded as five sources because an
invite has two halves: a standing **first-session offer**, whose eligibility
is "has this patient ever **committed** to paying for a session" asked of the
database and so cannot be claimed twice or posted from a browser - committed
rather than paid, because a session on pay-later terms is never paid and the
older test therefore read a trusted patient as brand new on every booking
they made, in all three places that ask it (`src/lib/priorSessionsServer.ts`
is the one query they now share); a **goodwill adjustment**
an admin applies to one unpaid session with a mandatory reason and an audit
row; a **promo code**, a campaign an admin sets up that a patient claims by
typing its name at checkout; and a **patient invite**, which takes something
off the invited friend's first session and something off the inviter's next
one. They never stack - the largest applies, and a tie goes to the most
deliberate decision - travel is never discounted, and all four facts are
recorded - list price, amount off, which rule, and why - so the books can
tell "sold cheap" from "discounted". What discounting cost is **reported** on
Money → Costs, split by rule and never deducted from profit: it is already
inside gross revenue as a smaller number. Bundle pricing stays
`compare_at_paise` on a package.

**The payment screen quotes what checkout charges, and a discount may reach
zero.** One module resolves the price and every discount
(`src/lib/checkoutQuote.ts`), read by three callers that must never disagree:
`/api/appointments/quote` (a read, for the figure on the button),
`/api/razorpay/create-order` (the authority, claiming under a row lock), and
`/api/appointments/confirm-free`. The wizard used to print the category price
while create-order silently applied a first-session offer behind it. When a
discount takes the total to nothing there is no gateway order at all -
Razorpay refuses one, and the old ₹1 floor charged a figure nobody was
quoted; `MINIMUM_CHARGE_PAISE` now means only "the least a gateway order may
be", tested by `isGatewayPayable`. The free confirmation re-resolves
server-side and refuses with 409 if anything is still owed, writes no
`payments` row (no money moved, and that table is keyed on Razorpay's own
ids), records `amount_paid_paise = 0` with all four discount facts, and still
does everything a paid confirmation does - auto-assignment, the Meet event,
settling an invite half. A goodwill adjustment is the one rule still floored
above zero: it is a number a person typed, not an advertised free session.

**A promo code is an identifier, not an amount.** The browser sends the code;
every figure comes from the row an admin created. Its redemption cap is
enforced by `claim_promo_code()` under a row lock rather than by a count
taken a moment earlier, and a claim that is never paid for stops counting
after a checkout hold computed at read time - no status column, no sweep,
the same rule a pending session suggestion follows. The claim is recorded on
the booking (`appointments.promo_code_id`), not in a second table, so the
count and the money cannot disagree. Off by default
(`promo_codes_enabled`), because a code field with no campaign behind it
teaches every patient that there is a discount they are missing.

**An invite is not a referral.** A referral is a hospital sending a patient
under a commercial agreement; an invite is one patient telling another, and
the two words stay apart (`patient_invites`, and the referral flow's own
"invite link" is now a *registration link*). The inviter's half is earned
when their friend's first session is **paid for**, never on a signup, and a
patient may claim an invite exactly once and only before their own first
paid session. Amounts are snapshotted at claim, so lowering the reward later
does not lower what was already promised. Off by default
(`invite_rewards_enabled`), with a per-patient ceiling on rewards.

Treatment is paid for through this platform, and two admin-switchable
controls keep it that way. Every string one role writes and another reads is
scanned (`src/lib/contactLeakScan.ts` via `src/lib/communicationFlags.ts`):
a payment handle or payment link is refused, a phone number or email is
delivered and recorded, and clinical text full of numbers is left alone -
the two tiers exist because a check that cries wolf is a check nobody
reads. A patient's phone is masked on the therapist's screens and their
email is not loaded there at all; the real number comes one session at a
time from `/api/therapist/reveal-contact`, inside a video session's join
window or on a home visit's own day, and every reveal is logged.
`communication_flags` and `contact_reveal_log` are admin-read-only and
append-only by trigger. See the "platform keeps its own conversations" rule
in `AGENTS.md`.

Suspicious patterns surface on Today → Risk as `risk_signals`, written by a
bounded lazy sweep after the admin render. A flag is never an accusation and
never carries a penalty - nothing is suspended, held or hidden because a rule
fired; a signal links to the rows behind it and an admin acts, if at all,
through the ordinary screens. Thresholds are `risk_rules` and the two that
need a clinic baseline ship disabled. Reviews are append-only and need a real
note.

A Master Admin can open a patient's, therapist's or partner hospital's
dashboard and see exactly what they see. It is a real session swap, not a
preview -- the browser becomes that account, so every control works and every
write is recorded as theirs, which is what makes a bug that only appears on
submit reproducible. Fenced accordingly (`src/lib/impersonation.ts`): full
scope only, never another admin, a ten-character reason on a row the admin
cannot rewrite, written before the swap, a thirty-minute window the proxy
ends rather than the browser, and an amber bar on every screen naming the
account and carrying Exit. See the impersonation rule in `AGENTS.md`.

Payments are recorded in `payments` (one row per Razorpay order, unique on
both the order id and the payment id) and confirmed by whichever of the
browser callback or `/api/razorpay/webhook` arrives first - both go through
the one idempotent `record_payment_capture` function. Setting
`RAZORPAY_WEBHOOK_SECRET` is what makes the webhook half work; without it
a patient who pays and closes the tab leaves a paid order against an unpaid
booking.

Quick commands: `npm run dev`, `npm run build`, `npm run start:cluster`
(production on several Node workers -- one process renders React on one
thread, and under 200 concurrent visitors that thread, not Supabase, is what
makes the admin dashboard slow), `npm run test` (Vitest over
the dependency-free `src/lib` modules), `npm run verify` (lint + test +
build), `npm run lint` (which also
runs `npm run check:realtime`, the Supabase Realtime publication coverage
check, and `npm run check:grants`, which fails when a `security definer`
function in `schema.sql` is not revoked from all three of `public`, `anon`
and `authenticated` -- `scripts/check-live-grants.mjs` asks the running
database the same question and is run by hand after a schema change),
`npm run seed:qa`, which recreates every account the manual test
plan names after a data reset has deleted them, and `npm run clean:e2e`,
which clears the fixture rows earlier e2e runs left in the database -- a
direct-insert purchase or appointment never claims `visits_used` and never
gets a calendar event, so each one left behind is a permanent red row on
Settings -> System Health. Its `--reconcile` mode is the one to reach for: it
releases the credit and cancels the appointment rather than deleting
anything, which is what the ledger's own append-only trigger asks for. Pay
later's fixture money is the one thing only `--apply` can clear: a confirmed
settlement has no undo by design, and left behind its unallocated remainder
nets off the next run's owed figure, so the patient's widget reads less than
the sessions listed under it. A Playwright
e2e suite covers the money-critical paths, the public pages' section
navigation, the catalog detail dialogs, the specialist booking handoff and
the patient-only booking rule, therapist-suggested sessions, the Home
page walkthrough's admin-configured rotation pace, and self-signup without
an email-confirmation step, the brand splash's cold-open and
long-absence rules and its admin settings, and the Session Completed cutoff,
and the therapist roster end to end -- ranges, exceptions, leave,
authorization, stale and double-clicked saves, and the booking regression --
and each admin scope's own landing screen, and pay later end to end in a
real browser -- the grant, a booking with no payment screen, completion
putting the money in three places at once, a declaration that settles
nothing until an admin confirms it, and a write-off that costs the clinic
without moving a single money figure, and the payment step's own pay button
staying tappable while its price loads, and the refund record that a refund
writes before the money moves - which cannot be resolved twice, rewritten or
deleted
(`npm run test:e2e`, see `e2e/`)
but needs a test Supabase project and Razorpay test keys - verify a change
with a build and a lint.

**Two gears, and the whole suite is the slower one.** A bug fix or a code
change gets a **quick retest and a regression**: `npm run verify` plus the
two or three specs covering what moved
(`npx playwright test e2e/<the-spec>.spec.ts`) - the case the change was made
for, and the rest of that file plus anything over the same screen or money
rule. The **whole** suite is run **once before the merge**, on the branch as
it will land. It is `workers: 1` against one project and one app instance by
design, so running every spec file after every fix spends minutes
re-proving cases the change could not have touched - and it is how a red run
becomes routine, which is a suite nobody reads. **Updating the suite is part
of the change**, though, not part of the merge: a fix that alters what a
person sees, a rule, a route or a row writes or amends its spec in the same
commit, the same rule these docs follow. See the two gears in `AGENTS.md`.

These three docs describe the app, so keep them current - and the same
triggers keep `e2e/` and `docs/qa/src/` current, in the same commit, since a
spec left asserting a product that no longer exists goes stale silently and
keeps passing - the QA plan's **source** only, never its PDF, DOCX or HTML,
which are built on request and never as part of a fix: whenever a change
adds or removes a route, role, environment variable, npm script, or alters a
documented rule (booking lead time, refund window, payment verification, Meet
sync, payout math) or a schema flow, update the docs in that same change
before it reaches `main`. See "Keeping the docs current" in `AGENTS.md`.

@AGENTS.md
