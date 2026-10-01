# The four dashboards, and moving between screens

Real routes rather than anchors, the shared Overview, the derived feed, realtime, and every way back in.

**Mostly lives in:** src/lib/dashboardFeed.ts · patientDashboardData.ts · liveUpdates.tsx · refreshCoverage.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Patient, therapist and hospital dashboard sections are real routes**, not
  anchors on one long scroll. Each nav item has an `href`
  (`/patient/dashboard/sessions`, `/therapist/dashboard/earnings`, ...) and
  its own `page.tsx`; the scroll-spy path in `DashboardShell` now only
  serves Edit Profile's sub-sections. The reason is UX: spy-highlighting
  made the sidebar appear to change its mind while you read. Each dashboard
  has one server-only loader (`src/lib/patientDashboardData.ts`,
  `therapistDashboardData.ts`, `hospitalDashboardData.ts`) that every one of
  its routes calls, so seven routes cannot grow seven slightly different
  copies of the same queries, and a `*DashboardShell` component holding the
  sidebar/header/realtime props. Each loader takes the screen asking
  (`loadPatientDashboard("receipts")`) and skips what that screen cannot
  render - a tab is a server round trip now, so it must not pay for the
  whole dashboard's data to show one list. What the sidebar needs to decide
  which entries exist stays in the always-loaded core, or the nav would
  change shape as you move between screens. Anything rendered by more than one route
  (the session cards) is a real component, not a closure.
- **A partner sees what was delivered and what it earned them - never the
  session.** The hospital loader reads referred patients' **completed**
  sessions only, and never `meet_link`: a consultation is private to the
  patient and their therapist, and the Earnings screen once rendered a live
  Join button into it. Each session's commission comes from
  `hospitalSessionLine` (`src/lib/hospitalEarnings.ts`), which calls
  `partnerCutFor` - the same function the admin Money screens use - so the
  two screens agree by construction, at the rate frozen at completion
  (`hospital_share_percent_at_completion`) and on pay-later sessions from
  delivery. A session whose completion snapshot names no partner or a
  different one earns this partner nothing. Every read is paged
  (`readAllRows` / `readAllRowsByIds`), and a failed read shows the load
  banner instead of "no referrals" or "₹0".
- **Every dashboard opens on the same Overview.** Patient, therapist,
  hospital and admin all render `DashboardOverview.tsx` - a strip of four
  figures (`StatStrip`), the notification feed (`ActivityFeed`), and a
  quick-actions list - in that order, because that is the order people ask
  "how am I doing / what needs me / what do I do next". Sections are
  `SurfaceCard`, statuses are `StatusPill`, blank states are `EmptyState`
  (all in `src/components/dashboard/`); do not hand-roll another white
  rounded box with a bold heading. The feed itself is *derived*, not
  stored: `src/lib/dashboardFeed.ts` turns rows each page already queries
  into `FeedItem`s, so there is no notifications table to keep in sync and
  no cron to write it (see the no-cron rule in `docs/rules/data-schema.md`).
  `needsYou` replaces
  read/unread - it marks what is still waiting on the viewer, and `sortFeed`
  pins those above everything else before sorting by date within each group,
  then caps repeats of one title at `MAX_PER_TITLE`. The cap is the other
  half of the pin: pinning alone let one noisy kind fill all twelve slots -
  a patient with a dozen abandoned checkouts saw "Payment not completed"
  twelve times and never saw that they had sessions already paid for and
  never booked. The twelfth identical line was never information.
  **A feed item's date is the row's, never the render's.** The three admin
  queue rollups -- signups waiting, change requests, sessions with no meeting
  link -- took a bare count and stamped themselves `new Date()`, and this
  dashboard re-renders on every realtime event, so "5 signups waiting for
  approval" reset to *just now* on every refresh. A signup that had waited
  three days read as having just arrived, which is exactly backwards for the
  one class of item that gets more urgent the longer it is ignored, and it
  pinned the queue to the top of a date-sorted feed for a reason that had
  nothing to do with the queue. They take a `QueueRollup` now -- the count
  **and** the oldest waiting row's own timestamp, built by `queueRollup()`,
  which takes the oldest rather than the newest because a queue's age is the
  age of what has waited longest. The two halves travel together in the type
  precisely so a count can no longer arrive without a date; changing it
  failed at every call site, which is what a bare count could not do. An
  empty list yields count 0 and no item is pushed, so an item on screen
  always has a real date behind it and there is no missing-date case to
  invent a fallback for.
  The pinning is load-bearing rather than cosmetic: an item dated when it
  arose sinks further the longer it goes unanswered, which is backwards for
  the one class of item that is still owed something - a programme paid for
  a month ago with sessions unbooked is the case that made it obvious.
- **Assigning is not reassigning, and the word has to say which.** A session
  nobody has ever been assigned to offered only "Reschedule / Reassign",
  which reads as editing something that already happened - so the one
  action an admin most often needs had no name on screen. Where a therapist
  is missing, every surface now says **Tap to assign**: the All Sessions and
  Calendar rows carry it as a chip (the row click already opens the drawer,
  where the work is done), `EditBookingForm`'s trigger swaps its label on
  `currentTherapistId`, and `SessionDetailDrawer` leads with
  `AssignTherapistForm` - one tap, honouring `preferred_therapist_id`, the
  therapist the patient asked for - with the reschedule form kept below for
  when the time has to move too.
- **A session is listed once - on every dashboard, not only the admin's.**
  The patient's and therapist's video sessions and home visits were
  separate sidebar entries over the same `appointments` rows, so "what is
  next?" was a two-screen question. Both are now one Sessions screen using
  `SessionFilterList` (Upcoming / Past / Cancelled, plus a Video / Home
  visit filter that only appears for people who have both). Add a filter
  rather than a second list.
- **A different way of looking at the same rows is a view switch, not a
  sidebar entry.** Calendar was its own entry on the patient and therapist
  dashboards and is now a List/Calendar toggle on Sessions
  (`SessionsView`); Programmes was its own entry and is now a
  Patients/Programmes toggle on the therapist's My Patients
  (`TherapistPatientsView`). Both render the *same* server-rendered cards,
  passed in by id, so the two views can never disagree about a session.
  Before adding a nav entry, ask whether it is a different set of rows or
  the same rows arranged differently - only the first earns an entry.
- **A screen that can only ever be empty is not in the sidebar.**
  `buildPatientNavItems` hides Sessions, Packages and Payments until the
  patient actually has one, and the therapist's Programmes toggle only
  appears for a therapist with package patients. Booking is the deliberate
  exception: it is always shown, because that is how a patient gets their
  first of anything.
- **A dashboard refresh is expensive; debounce accordingly.**
  `RealtimeRefresh` turns a `postgres_changes` event into `router.refresh()`,
  which on the admin dashboard re-runs the whole Server Component - ~40
  queries, every screen, not only the visible one. It fires on the **leading
  edge** and then holds a `cooldownMs`, rather than debouncing: the first
  change always lands immediately, and only the burst behind it is collapsed
  (a plain trailing debounce would delay every lone event too, which is the
  case an admin is actually watching for). `AdminShell` runs two channels on
  that basis: operational tables (bookings, payouts, profiles, care records)
  on a short cooldown, and catalog/settings tables (`site_settings`,
  treatments, packages, testimonials, FAQs, areas) on a much longer one,
  since those change only when an admin edits them and the editor already
  sees their own change. Put a new table in one of those two
  `*_REALTIME_TABLES` arrays rather than inlining a third list - the coverage
  check reads them by that name - and add the matching `alter publication`
  to `schema.sql` in the same change.
  **On the admin dashboard the channels count instead of rebuilding.** Both
  are passed `mode="notify"`, `AdminShell` wraps itself in
  `LiveUpdatesProvider` (`src/lib/liveUpdates.tsx`), and the header's Refresh
  button turns teal and carries the number waiting. Two controls were
  answering the same question and only one of them was asked: a rebuild here
  is ~41 queries and every screen's markup, almost nothing arriving is a
  change the reader is waiting on, and the page moved the list they were
  reading while they read it. The other three dashboards keep
  `mode="refresh"` -- a rebuild there is cheap and the reader usually *is*
  waiting for that row (a patient watching for a therapist's suggested
  time). What it costs is stated rather than hidden: a Today figure can be
  minutes old, and the badge is the sentence saying so. The count clears on
  **any** deliberate refresh, through `onLocalRefresh`, never on the button's
  own click -- a control that mutates and refreshes would otherwise leave a
  count standing for rows it had just fetched. `useLiveUpdates` answers 0
  outside a provider rather than throwing, same posture as `useToast`, so
  `RefreshButton` renders unchanged where nothing counts.
  **A browser does not rebuild, or count, for its own work -- and a refresh is
  a window rather than an instant.** Most events reaching an open admin
  dashboard are that dashboard's own writes coming back: a control's route
  changes its row *and* writes an `admin_activity_log` entry, and the control
  has already called `router.refresh()`. Left alone those two events cost two
  more full rebuilds, the second up to the catalog channel's 30 seconds later
  -- by which time the admin has forgotten the tap and reads it as the page
  reloading on its own; on the admin dashboard, where the channels count
  instead, they cost two on the Refresh badge instead.
  `useRouter().refresh()` stamps `src/lib/refreshSignal.ts` when it starts
  **and again when the transition lands**, and `RealtimeRefresh` asks
  `isCoveredByRefresh` (`src/lib/refreshCoverage.ts`) whether the event falls
  inside that window.
  **Comparing against the start alone was a bug, and it was the loud kind.**
  That test -- "did a refresh start after this event arrived" -- can never be
  true for the browser's own work: the route commits, the response returns,
  the control refreshes, and only *then* does the event reach the browser. So
  the window was empty, it suppressed nothing it was written for, and on the
  admin dashboard every action an admin took added one (two, across the two
  channels) to a badge their own refresh had just cleared. It was reported as
  the count going up for no reason, which is exactly what it was doing.
  Five details are load-bearing. It compares timestamps rather than tagging
  events, which is what makes it work across both channels and across every
  control in the app -- none of which knows which rows its route touched. It
  tests the **newest** waiting event, not the oldest, so a burst whose tail
  landed after the window still fires. A *skipped* fire does not start a
  cooldown: counting one would hold the next genuine change off for up to 30
  seconds for a rebuild that never happened. A refresh **still in flight
  covers everything**, because this dashboard's own render was measured at
  3.5s and its news lands inside that -- but only up to
  `MAX_REFRESH_IN_FLIGHT_MS`, so a settle that never arrives (a transition
  that died) cannot wedge the suppression on and leave the admin told that
  nothing ever changes, which is the worse failure of the two. And once
  settled the window closes after `REALTIME_HOP_GRACE_MS`, which is for the
  websocket hop and nothing else.
  **What it trades is stated rather than hidden:** a change by somebody else
  landing inside that window is absorbed and this browser is not told. That is
  a real loss and it is the better side -- the badge exists to say the screen
  is behind, and one that also counts the reader's own taps is one they learn
  to ignore, the same reasoning that keeps a red health banner off a screen
  where it would always be showing. The next change re-raises it, and the next
  refresh reads every row either way. `refreshCoverage.test.ts` pins the
  arithmetic and `e2e/admin-refresh-badge.spec.ts` pins what a person reads --
  driven as a screen because no route and no row changed, and carrying its own
  RB-000 egress probe, since the badge is fed by a socket that never opens in
  a sandbox and every other case would pass vacuously.
  **And a lazy sweep must not be able to refresh the render that started
  it.** Anything running in the dashboard's `after()` that *writes* a table
  on one of these channels closes a circle: render, write, realtime event,
  render. Every such sweep therefore carries a minimum interval remembered
  per server instance - `runRiskSweep`'s five minutes, and
  `retryDueMeetSyncs` / `retryDueMeetAccess`'s one, claimed only once the
  sweep has found work so an empty backlog never holds off the next one.
  Without it the circle is bounded only by each row's attempt cap, which
  bounds it by spending all five of an appointment's automatic retries inside
  a minute and retiring it to "needs a person" before the transient failure
  it was retrying could clear. `risk_signals` moved to the catalog channel in
  the same change, for the same reason: it is written by that sweep and read
  by a queue an admin opens deliberately.
- **The way back in is one rule, not one per surface.**
  `useAccountDestination()` (`src/lib/useAccountDestination.ts`) answers
  "where does this account go, and what do I call it", and both surfaces that
  offer somebody a route back into the app read it: the public `Navbar` and
  the booking wizard's exit link. Two copies of that logic is two chances to
  send a patient somewhere the label did not name. It resolves on the client
  deliberately -- `/book` and `/book-home-visit` are ISR-cached, and reading
  the session server-side would force every one of those pages dynamic to
  answer a question about one link.
  It returns **`signedIn` separately from `destination`**, and that
  separation is load-bearing: both are null while the session is still being
  read, and a caller that swaps one control for another needs to tell "not
  signed in" from "not known yet". Collapsing them showed Sign In and Get
  Started to somebody who was already signed in.
  **The booking wizard's exit follows the account, except into a waiting
  screen.** It read *Back to Home* always, which is right for a visitor who
  arrived from the marketing site and wrong for the commonest case -- a patient
  who came from their own dashboard to book, and was being sent to the public
  home page. Signed out it still says Back to Home (or Back to Home Visit, per
  wizard); signed in and approved it says **Back to Dashboard** and goes there.
  It stays outside the wizard so it covers every one of its states without
  being repeated four times.
  **It must never offer `/pending-approval`, and it did.** A patient who signs
  up *inside* the wizard is unapproved **by construction** --
  `/api/razorpay/create-order` flips `approved` the moment they genuinely
  attempt checkout, precisely so they land in their dashboard rather than on a
  waiting screen. So between Step 2 creating the account and Step 3 taking the
  payment, the one control on the payment screen read **"Approval pending"**,
  telling somebody their account was awaiting approval at the exact moment they
  were about to pay -- which reads as "you cannot do this" and offered, as its
  only way out, a dead end that abandons the booking. A patient mid-booking is
  not waiting on approval; they are mid-purchase, and they get the ordinary way
  back. The public `Navbar` still names that destination and is still right to:
  out on the marketing site an unapproved account really would be bounced
  there. **Suspended is still named** on both, because that is not a state
  somebody leaves by paying -- checkout refuses them -- so saying nothing would
  leave them tapping a button that cannot work.
  `e2e/booking-exit-link.spec.ts` holds both halves.
- **A signed-in person always has a way back in.** The public `Navbar` hides
  Sign In and Get Started once somebody is signed in, so whatever replaces
  them is the only route back into the app from the marketing site. It used
  to be one boolean: an account waiting on approval, or suspended, got
  **nothing** -- the two CTAs gone because they are signed in, and no button
  in their place -- which is how an unapproved patient ends up on the home
  page with no way forward at all. The reasoning was sound and the fix was
  the wrong half: the button was dropped to avoid a round trip through
  `/dashboard`, when the round trip is what wanted removing.
  It is three destinations now, from the same `approved`/`active` pair the
  proxy enforces on, each linked **directly**: `/dashboard` ("Go to
  Dashboard"), `/pending-approval` ("Approval pending"), `/account-suspended`
  ("Account suspended"). Suspended is checked first, since an account can be
  both and the suspension decides where they land. The label names the real
  destination -- a button reading "Go to Dashboard" that opens a waiting
  screen is the "never tell someone they did something they did not do" rule
  in its navigational form. It starts **null** so a slow lookup offers
  nothing rather than briefly offering the wrong thing -- but a lookup that
  *finishes* badly, a read error or a row that is not there, falls back to
  `/dashboard` rather than staying null. Null forever is the original bug in
  its failure case: the navbar hides Sign In the moment somebody is signed
  in, so a dead profile read left them with no Sign In **and** no
  destination, stranded on the marketing site. `/dashboard` resolves the role
  server-side and the proxy carries an unapproved or suspended account onward
  from there, so the fallback is always correct and only ever one hop longer.
  `/pending-approval` and `/account-suspended` are in
  `AUTH_CTA_HIDDEN_ROUTES` so the button never points at the page it is on.
- **Every dashboard needs a way back to the public site.** All four are in
  `NAV_HIDDEN_ROUTES`, so the public `Navbar` never renders there; without an
  explicit link the only exit is Log Out, which also ends the session. Both
  shells (`dashboard/DashboardShell.tsx`, `admin/AdminShell.tsx`) carry a
  **Back to Home** entry in all three renders
  (expanded, collapsed rail, mobile drawer). It is a plain `<a>`, not
  `next/link`, for the reason the nav entries document: client-side
  transitions into a differently-chromed route were silently not completing.
