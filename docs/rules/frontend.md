# Writing the UI

Dates in the clinic's zone, voice, no browser default ever speaking to a person, disabled controls, the progress bar, toasts, paging, and the style rules.

**Mostly lives in:** src/lib/formatDateTime.ts · src/components/system/ · src/lib/usePagedList.ts · src/lib/toast.tsx

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Copy that two roles read needs a `voice`, not a compromise.**
  `ConditionIntakeWizard` and `ConditionIntakePanel` are filled by the
  patient *and* by a therapist on their behalf, and the same sentence cannot
  be true for both - a clinician was being told "this is your own account of
  your condition, in your words". Both take `voice: "patient" | "clinician"`
  and branch every sentence that addresses someone. A new string on a
  shared surface either reads correctly for both or gets a branch; there is
  no third option, and "mostly fine" is how the leak happened.

- **Never tell someone they did something they did not do.** Three separate
  bugs came out of one habit: `draft_data` is shared by both roles' autosave,
  so a therapist's abandoned edit told the patient *"You left off part-way
  through"* (fixed with `draft_saved_by_role`); the counter said "3 of 7
  answered" over "Add the missing answers" for questions a clinician wrote
  and never asked (fixed with `answerAuthorship()`, derived from the
  approved-submission rows already on file rather than a new column); and
  the banner said "Your therapist has your answers" about a record the
  patient never sent. Attribution is not a nicety on a medical record.

- **Every date renders in the clinic's zone, and the zone is never left to
  the runtime.** `toLocaleString()` with no `timeZone` formats in whatever
  zone the *runtime* is in -- on the server that is the host's, which is UTC,
  so a session booked for 6 PM IST printed as "12:30 PM" on the patient's own
  Overview; inside a client component the same call used the browser's zone
  instead, which is a different wrong answer and a hydration mismatch between
  the two. Ninety-one call sites were formatting that way.
  `src/lib/formatDateTime.ts` is the one answer -- `formatClinicDate`,
  `formatClinicDateShort`, `formatClinicTime`, `formatClinicDateTime`, all
  pinned to `Asia/Kolkata` and `en-IN`, all rendering a dash rather than
  "Invalid Date" for something unreadable. Pinned rather than per-viewer
  because the alternative is two people reading one screen and disagreeing
  about when a session is, with nothing on screen to say why.
  Three exceptions, each real and each documented where it sits:
  1. **A session slot** is formatted in the zone the patient booked it in
     (`formatSlotTime`, `appointments.patient_timezone`) -- the booking's own
     record of what they were looking at when they chose it. Its no-zone
     fallback for legacy rows is the clinic's zone, not the runtime's.
  2. **A wall-clock date** -- `new Date(y, m, d)` in `bookingSlots.ts`, which
     has no instant behind it -- must *not* be pinned: formatting a local
     midnight in another zone prints the previous day for any viewer east of
     India.
  3. **"Saved 3:42 pm"** on the intake wizard is the viewer's own clock,
     because it is their own draft, set in their browser, and gone on reload
     -- not a stamp on a record two people have to agree about.
  `formatDateTime.test.ts` walks every `.toLocale*String(` in `src/` and
  fails on one without an explicit zone, with those two files exempted by
  name. The check earns its keep because this failure is invisible locally:
  a developer's machine is often in the same zone as the clinic, and it only
  shows on a UTC host.
- **An account says when it was created, with the time on it, wherever that
  account has a screen.** `profiles.created_at` was rendered three ways and
  not at all in two places: the People directory carried the date *and* the
  time, the patient and therapist detail headers carried the date alone, and
  the Partners card and the Pending Approvals queue carried nothing -- both of
  which had selected the column all along. A date with no time answers
  "roughly when" and not "which of the two accounts this person made on
  Tuesday", which is the question an admin holds while the person is on the
  phone; and on the approvals queue it is how long somebody has waited, on the
  one list whose rows get more urgent the longer they sit. It is
  `formatClinicDateTimeWithZone` everywhere, on all six surfaces plus each
  role's own Edit Profile screen, through `AccountCreatedNote` for the three
  dashboards. That helper is the old `src/lib/formatIST.ts` folded into
  `formatDateTime.ts` rather than a second formatter over the same locale and
  the same zone; the `IST` suffix stayed with it, because this is the one
  family of figures read down a phone line by an admin in India to somebody
  who may not be, where every other figure is read on the screen it is printed
  on. It renders **nothing** for an absent stamp: the column is `not null`, so
  a missing value means the read failed or the select forgot it, and
  "Account created -" is a label on an absence.
  `e2e/account-created-stamp.spec.ts` is the guard, driven as screens because
  no route and no row changed -- every one of these values was already in the
  page's own data.
- **Every list pages, and every list that has a dimension filters.**
  A list of rows ends with `ListPager` (`src/components/dashboard/`), the
  one control: a "Show N per page" number field, Previous/Next that grey
  out when there is nothing in that direction, and an "x-y of n" count. It
  is driven by `usePagedList` (`src/lib/usePagedList.ts`), which pages the
  rows the screen already has -- these lists filter in the browser and the
  export buttons read the same filtered array, so fetching per page would
  make the download disagree with the list. A `storageKey` remembers that
  one list's page size per browser; wanting 100 payouts on screen says
  nothing about wanting 100 FAQs. Filtering, sorting, totals, balances and
  both exports always run over the **whole** filtered set -- only what is
  painted is paged, or a range total starts describing a page. A list a
  Server Component rendered uses `PagedList` instead, which takes finished
  elements keyed by id (a function prop cannot cross that boundary, a
  rendered element can) plus an optional `group` per item and a `filters`
  list, and works the counts out itself. Filter chips are `FilterChips`,
  and `PagedList` hides them unless two of them would actually have rows
  behind them -- a filter nobody can act on is noise. Don't cap a list at
  an arbitrary number with a "Show all" escape hatch: that was what All
  Sessions did, and "Show all" then painted every row anyway.
- **A control is disabled by its own work, never by a background read.** The
  booking wizard's Pay button carried `disabled={loading || quoting}`, where
  `quoting` is a price read that fires on arriving at Step 3 and again on every
  promo code applied -- so the primary control of the payment screen was dead
  for a round trip each time, with nothing on the button saying why. A disabled
  button that is *about* to work is indistinguishable from a broken one, and a
  patient who taps a dead pay button taps it again; it is the navigation rule
  one control over, where a tap that is not acknowledged reads as a fault.
  The answer is to **queue the tap, not refuse it**: `submitFromPaymentStep`
  sets `loading` the instant it is pressed and then awaits the in-flight read
  before choosing its branch, so the wait is acknowledged rather than enforced
  and the decision is still made on the figure that is about to land. Three
  details are load-bearing. The in-flight promise is published on a ref
  (`quoteInFlight`) rather than inferred from the `quoting` boolean, since a
  boolean says a read is happening and gives a waiter nothing to await. The
  waiter **loops** while one is in flight, because applying a promo code starts
  a second read while the first is open and awaiting only the first acts on the
  figure that is about to be replaced -- the exact thing the disable was for.
  And the read's promise never rejects (its own body swallows every failure and
  a failed read leaves the previous answer standing), or a waiting tap would
  hang on it. The `quoting` flag stays, as a line saying the price is being
  checked: the wait is **stated, never enforced**, the same split the amber
  line on Booking Rules follows.
  The legitimate disable is the opposite shape and is easy to tell apart: a
  control disabled while **its own** request is in flight, with its own label
  saying so -- `PromoCodeField`'s Apply reading "Checking…", the home-visit
  wizard's Check reading "Checking..." -- which is duplicate-submit prevention
  rather than a wait imposed on somebody else's action. A validity gate
  (`disabled={saving || reason.length < MIN}`) is the same case: the control
  cannot succeed yet, rather than being made to sit out a read it did not
  start. Before adding a flag to a `disabled` prop, ask whether the flag
  belongs to that button's own work; if it does not, await it in the handler
  instead.
  `e2e/booking-pay-button-live.spec.ts` is the guard, driven as a screen
  because nothing here changes a route or a row -- the quote route is *delayed*
  rather than raced, since the real window is a few hundred milliseconds and a
  test trying to catch it would flake in whichever direction it lost. It pins
  all three halves: the button enabled with the read in flight, the wait stated
  on the screen instead, and a tap during the read acknowledged at once --
  because accepting a tap and then showing nothing until the read lands is the
  same fault wearing a different hat.

- **The wait has to be visible, and it outlives the button.** Every mutating
  control had its own `loading` flag, and that flag was the problem: the
  shape was `setLoading(false); router.refresh();`, so the button went back
  to looking idle and *then* the expensive half started. On the admin
  dashboard a refresh re-runs the whole Server Component -- every screen's
  markup, not only the visible one -- with nothing on screen saying so, which
  is what gets reported as a freeze. A per-button flag cannot cover it: the
  work outlives the control (the row it sat in is refreshed away), and a
  navigation has no button left at all. So the signal is one counter at the
  root (`PendingWorkProvider`, `src/lib/pendingWork.tsx`) and one teal bar
  above every piece of chrome (`RouteProgress`). Three rules:
  1. **`useRouter` comes from `src/lib/useRouter.ts`, not `next/navigation`.**
     It is a drop-in with the same shape whose `refresh`/`push`/`replace`
     run inside a React transition -- the only thing that knows when a
     navigation has actually landed -- and reports that to the counter. That
     is why 100-odd client components changed one import line and nothing
     else: adopting it at the source covers every call site, including the
     ones that will be written next.
  2. **No percentage, ever.** Nothing in the client knows how far along a
     server render is. The bar eases toward a ceiling it never reaches and
     completes in one movement when the work lands; a bar that sits at 90%
     is a lie people learn to ignore.
  3. **It waits `APPEAR_AFTER_MS` before drawing.** Most actions finish well
     inside it, and a bar that flashes on every tap makes a fast app feel
     busy. Reduced motion keeps the bar and drops the travel -- someone who
     asked for less movement still needs to know the app is thinking.
  **The split matters at the call site, not only at the root.** A control
  that runs its fetch *and* its `router.refresh()` inside one
  `startTransition(async …)` keeps its own `isPending` true until the refresh
  lands -- so on the admin dashboard the button stays disabled and spinning
  through a full Server Component re-render, which is reported as a hang. The
  shape is: the control is busy for **its request**, releases in a `finally`,
  and calls `router.refresh()` after, handing the rest to the bar. That is
  not the `setLoading(false); router.refresh();` mistake above -- the
  difference is that the bar now exists to carry the half the button cannot.
  Guard the submit with a synchronous ref as well (a `disabled` attribute
  lands a render too late), and catch the request: an unhandled throw inside
  a transition puts nothing on screen at all.
  **And `await confirm(...)` never goes inside a transition -- that one is a
  deadlock, not a slow button.** `useConfirm` renders its dialog from state,
  so wrapping a submit that awaits a decision means the dialog that resolves
  the decision is itself an update belonging to the transition that is waiting
  on it: nothing paints, the promise never settles, and the control spins for
  ever. `PayLaterWriteOffForm` shipped that way and **Write it off did nothing
  at all** -- and neither did its undo, which is the worse half, because a
  debt the screen said was forgiven was not. Await the decision first, then
  transition only the request that follows, which is what
  `PartialRefundForm` and `HomeVisitCashLedger` already do; where the request
  wants its own busy state, keep the plain `useState` + `finally` shape above
  and hand the refresh to the bar. It was invisible to every check this repo
  has -- the route, its unit tests and its SQL assertions were all correct and
  all passed -- and `e2e/pay-later.spec.ts` PL-UI-007 is what found it, by
  being the only thing that ever pressed the button.
  **An append-only log does not belong on the operational realtime channel.**
  Every mutating admin route writes `admin_activity_log`, so while that table
  sat on the 2s channel each action rebuilt the whole dashboard twice -- once
  for the row it changed, once for the entry describing it -- and the admin
  who acted had already refreshed deliberately. It is on the 30s channel with
  `contact_reveal_log` and `risk_reviews`, which are there for the same
  reason.
- **A change that leaves no trace on screen has to say what it was.** Every
  mutating control ends the same way -- the request lands, `router.refresh()`
  re-runs the Server Component, and the screen re-renders into a state that
  looks identical. A toggle that was off is now on and the only evidence is
  a switch the person has stopped looking at; on a slow render it is
  indistinguishable from nothing having happened. `ToastProvider` +
  `useToast()` (`src/lib/toast.tsx`) is the answer, mounted in the **root
  layout above every route** -- which is what makes the confirmation survive
  the refresh the control itself fires, with no cookie and no message
  replayed on the next load. Three rules:
  1. **It names the thing and its new state.** "Home visits are on", never
     "Saved" -- a confirmation that does not name the thing tells somebody a
     request finished, which they could already see. For settings that
     wording lives in `src/lib/settingMessages.ts`, one vocabulary for the
     whole section in the owner's words rather than the column's, and
     `settingMessages.test.ts` fails when a key an admin screen can write
     has no sentence, reads a column name back to a person, or mis-pluralises
     a unit.
  2. **`useToast()` never throws outside a provider.** These controls render
     in dashboards, in modals and in the booking wizard on a public page, and
     a missing confirmation must not be the thing that takes a screen down --
     same posture as the audit log's best-effort write.
  3. **One `saveSetting`, not eight.** That helper was copy-pasted into every
     settings surface, which was survivable while it only made a request and
     stopped being survivable the moment saving needed to *say* something:
     a confirmation added to one copy is seven screens that do not get one.
     It is `useSaveSetting()` now, and a failure raises an error toast **and
     rethrows**, because the callers roll their optimistic switch back on a
     throw.
  **The bar has to hear about the navigation, and three dashboards were
  silent.** `useRouter` covers every navigation this app starts in code,
  which is why the admin dashboard always had a bar and the other three
  appeared to have none: patient, therapist and hospital move between
  sections with **plain anchors** (a deliberate choice -- client-side
  transitions into a differently-chromed route were silently not completing),
  and a hard navigation never touches the router hook, `useLinkStatus`, or a
  client-side `loading.tsx`. Nothing in React learned a navigation had
  started, so the person sat on the old screen with no acknowledgement at
  all. Two halves fix it, and both are needed:
  - `useLeavingPage()` (`src/lib/useLeavingPage.ts`) marks the page as
    leaving on click. The old document stays on screen until the new one is
    ready, so a bar drawn then is visible for exactly the wait. It is
    **never released on that page** -- the document is about to be torn down
    and the bar goes with it, and releasing on a timer would clear the signal
    while the person was still waiting -- but it **is** released on
    `pageshow`, because a bfcache restore brings the page back exactly as it
    was, bar included.
  - `ProgressLink` (`src/components/system/ProgressLink.tsx`) does the same
    for real `<Link>` navigations, which the public Navbar uses. Next's
    `useLinkStatus` only works *inside* a Link, so the reporter is a child
    component rendering nothing rather than a hook the wrapper could call.
  **And the wait is the word-roll loader, over the old page - never a
  `loading.tsx` in a dashboard.** Each dashboard draws its sidebar inside its
  own page, so a loading boundary replaced the sidebar with the content: every
  tab tap showed a placeholder rail (it was dark, the old design) until the
  page arrived. So the dashboards have none. Both reporters above call
  `begin("navigation")`, and `NavigationLoader` (root layout) draws
  `WordRollLoader` - Move, Stretch, Strengthen, Recover, Restore scrolling
  past one a beat, the current word dark with three teal dots hopping in
  front of it - over the content area
  after 300 ms, at `z-20`, **under** every nav, sidebar, rail and tab bar
  (`z-30`+), with the old page faintly behind it. A refresh after a button
  press is `begin()` and gets the teal bar only: the page is staying put.
  `RouteLoading` is the same loader, for the one boundary left with no
  chrome to keep (the `/dashboard` role hop). **The admin `@modal`
  slot keeps its own `loading.tsx`**, and it is the case both loading signals miss: tapping a
  patient name is a `<Link>` into a parallel-route slot, which is not a
  `useRouter` transition (so no bar) and is not covered by an ancestor
  `loading.tsx` (which wraps the page tree, not a sibling slot) -- so the row
  was tapped, the server spent its render, and nothing acknowledged it. That
  fallback mirrors `DetailOverlayModal`'s own sheet rather than reusing
  `RouteLoading`: what is arriving is an overlay over the dashboard, and a
  full-page skeleton there would read as the dashboard itself being
  replaced; its wait is the small `WordRollLoader`. On a hard navigation the
  browser keeps the old document - loader included - on screen until the
  new one is ready, so the chrome never blanks. The public pages work the
  same way: no boundary, the loader over the page below the nav.
  **Every dashboard carries one Refresh button**
  (`src/components/dashboard/RefreshButton.tsx`), in the header of both
  shells -- so all four get the same control in the same place. It re-runs
  the Server Component and nothing else: a browser reload throws away the
  client state these shells keep on purpose (an open row, a half-typed
  filter, the collapsed sidebar) and re-downloads the bundle, and
  `RealtimeRefresh` only fires for subscribed tables, on the catalog channel
  behind a 30-second cooldown. This is the one control whose own pending
  state **should** span the refresh -- the split above is for a control whose
  request is a different thing from the refresh that follows it, and here the
  refresh *is* the work, so releasing the button early would leave it looking
  idle while what it was asked for was still running. It is disabled while
  pending, because stacking refreshes on the admin dashboard stacks ~40
  queries a tap for no new answer. Where the shell counts changes rather than
  rebuilding for them (the admin dashboard -- see the realtime rule below) it
  also **says how many are waiting**: without that the button asks somebody
  to guess whether there is anything to fetch. Its accessible name stays
  "Refresh this screen" whatever the count, so a screen reader does not meet
  a different control mid-action; the count is announced once by its own
  `role="status"` region.
  `Spinner` (`src/components/system/Spinner.tsx`) is the app's only spinner,
  inheriting `currentColor` so one component works on the filled, outlined
  and text buttons alike. Before it, every busy state was a text swap, which
  reads as a label change rather than as motion.
## Style

- TypeScript throughout; no `any` escapes for convenience.
- Tailwind utility classes; design tokens and font stacks are composed in
  `src/app/globals.css` (`--font-sans`, `--font-display`). Fonts are
  self-hosted via `next/font/google` - no runtime request to Google.
- Server components by default; add `"use client"` only where interaction
  requires it.
- Comments in this codebase explain *why*, especially where a non-obvious
  constraint or a past bug drove the shape of the code. Match that.
- **A wrapped JSX sentence containing an HTML entity loses a space, and the
  browser is the only place you can see it.** Next's compiler decodes entities
  in the same pass that normalises JSX whitespace, and where a text node both
  carries an entity (`&apos;`, `&quot;`, `&nbsp;`, …) **and** spans more than
  one source line, its leading space is dropped. Either half alone is
  harmless, which is why this survived: the identical sentence on one line is
  fine, and so is the same wrap without an entity. Eight sentences shipped
  broken -- "at least 24hours' notice", "For 1 sessionyou've already had",
  "Only turn this offif the Google account", "₹1,200excluded from this
  breakdown" -- and none of them is visible in the source, in review, or to
  esbuild, which keeps the space, so Vitest and Playwright transform the file
  differently from what the browser is served. It was found by reading pixels
  in a screenshot. The fix is always to make the space a child in its own
  right, `{" "}`, which nothing can trim; interpolating the whole sentence as
  a template literal is better where a ternary sits mid-sentence.
  `src/lib/jsxEntitySpacing.test.ts` walks every `.tsx` in `src/` and fails on
  one, the same shape and the same reasoning as `formatDateTime.test.ts`'s
  walk for unzoned dates -- a mistake that produces no error is one a
  reviewer will not catch.
- **`text-slate-400` is a dark-surface token.** On white it is 2.63:1, which
  fails WCAG AA for body text, and an axe-core sweep found it on 62 surfaces
  across the public pages and all four dashboards -- every one of them a label,
  a count, a hint or a code somebody actually has to read. The rule is by
  surface, not by taste: on the dark chrome (the footer, the debug bar)
  `text-slate-400` is correct and `text-slate-500` is
  the failure; on a white or `slate-50` card the floor is `text-slate-500`,
  and on a `slate-100` fill -- a segmented-control track, a neutral pill --
  it is `text-slate-600`, since slate-500 there is 4.34:1 and just misses.
  Every dashboard's sidebar and rail - the admin's included - is white:
  its active entry is `bg-teal-50` with `text-teal-800`, and the brand
  tile is `bg-teal-700`, not `-600`: white on teal-600 is 3.66:1. The same split applies to the chart constants in
  `src/components/admin/TrendCharts.tsx` (where the Money and Business Health
  screens both read them from) -- they are drawn as lines *and* printed as
  figures, so they take the -700 shades while `PatientProfitChart`, which only
  draws, keeps -600. Axis tick labels there are slate-500 for the same reason:
  they are read, not decoration.
  **The debug bar is the one surface the app-wide sweep could not see**, since
  it was run with `NEXT_PUBLIC_SHOW_DEBUG_NAV=false`. Its page picker and its
  simulate-time box carry `aria-label`s of their own -- the visible words
  beside them are spans that vanish below `sm`, so on a phone both controls
  were announced as nothing.
- **Every control carries an accessible name, and an icon-only one carries it
  explicitly.** A visible label is associated with `htmlFor` + `useId` (not
  by sitting next to the input), a control with no visible label at all --
  an icon button, a visually hidden `type="file"` behind a styled button, a
  number box under an `<h3>` -- takes `aria-label`, and a decorative glyph
  inside a named button takes `aria-hidden`. Two whole-app sweeps were needed
  to get here, so a new control without one is a regression rather than an
  omission.
- **A dialog opened by a tap uses `useDialogChrome`** (`src/lib/`), which is
  the one implementation of the contract: `role`, `aria-modal`, focus moved
  in on open and restored on close, Escape, a Tab trap and the scroll lock.
  It takes an `active` flag because `Modal.tsx` stays mounted and toggles
  `open` -- a hook that locked body scroll while closed is the bug that flag
  exists to prevent.
- **A dialog's open/close effect never depends on something that changes
  per keystroke.** The effect that records the opener, moves focus in and
  restores it on cleanup must run once per open: key it on a handler rebuilt
  each render (an inline `onClose`, or a `close` that closes over the form's
  values) and every keystroke re-runs it, the cleanup hands focus back to the
  opener, and only one letter lands at a time. That is what the health
  profile's intake wizard did. Hold the handler in a ref, as
  `useDialogChrome` does; the six hand-rolled dialogs (intake wizard,
  session note, the two package dialogs, the two home-visit dialogs) now do
  the same.
- **A row you can tap spreads `rowActivationProps`** (`src/lib/rowActivation.ts`),
  never a bare `onClick`. Nine `<tr>`/`<li>` rows shipped with a click handler
  and nothing else -- no tab stop, no key handler, and in every one of the nine
  no focusable child doing the same job -- so the detail dialog behind them
  could not be opened without a pointing device at all. That is the whole of
  Logs -> All Activity (the dialog saying what changed from what), All Sessions
  and the Calendar (the drawer that assigns, reschedules and refunds), Catalog
  -> Purchases, Money -> Breakdown's two ledgers, and the session list on every
  patient and therapist profile. The helper returns props rather than a
  component so it fits any element and changes no layout, and three things
  about it are load-bearing: it does **not** put `role="button"` on a `<tr>`
  (that takes the row out of the table for a screen reader, trading one group's
  access for another's -- the row's semantics were never what was missing, a
  tab stop was), it returns early when the key was pressed on a control
  *inside* the row (the keyboard counterpart of the `stopPropagation()` those
  cells already do for clicks), and it prevents the default on Space alone,
  since a row that opened a dialog and scrolled the page underneath it would be
  worse than one that did nothing. A focus-visible ring goes on the row in the
  same change: a tab stop nobody can see is half a fix.
- **No browser default ever speaks to a person.** Two of them used to.
  Submitting a form with a blank `required` box popped the operating
  system's own grey tooltip -- "Please fill out this field." -- unstyled,
  differently worded and differently placed on every browser, and the one
  piece of UI in the product nobody designed, since it comes free with the
  attribute. `FormValidationChrome`
  (`src/components/system/FormValidationChrome.tsx`) is mounted once in the
  root layout and replaces it everywhere: it listens for `invalid` in the
  **capture** phase (the event does not bubble, so a listener on `document`
  in the bubble phase hears nothing at all), calls `preventDefault` to
  suppress the native bubble -- the submit stays cancelled, which is the
  browser's doing rather than the bubble's -- and renders the app's own
  message anchored to the field, with a red ring on the control through a
  `data-invalid` attribute that `globals.css` paints.
  One listener at the root rather than an edit to 34 forms is the point: a
  form that has never heard of this file is covered, including the next one
  written. Four rules hold it:
  1. **The message is the first refused field's, looked up rather than
     inferred from the event.** The browser fires one `invalid` per refused
     control as separate dispatches, with a microtask checkpoint between
     them -- so a "first event of this burst" guard is released before the
     second event arrives and the message ends up describing the *last*
     refused control. A condition form with a blank name at the top pointed
     at the price near the bottom. The handler asks the control's own form
     which field is first invalid, reading `validity.valid` and never
     `checkValidity()`, which fires `invalid` again into this same listener.
  2. **One message, never one per field**, and the reader is focused and
     scrolled to it. Nine tooltips is worse than the bubble.
  3. **It clears the moment the reader acts** -- on input, on Escape, on a
     tap elsewhere, and when the control leaves the page under it (a
     `router.refresh()` replaces the row it sat on). A red ring on a field
     already corrected is the "never tell someone they did something they
     did not do" rule in its smallest form.
  4. **The wording is `src/lib/formValidationMessage.ts`**, dependency-free
     and unit-tested, because it is a judgement about language. It names the
     field from its own label (`tidyFieldLabel` drops the `*`, the colon and
     the "(required)" the message would otherwise repeat), words a choice as
     a choice ("Choose therapist", "needs ticking"), says what an acceptable
     value would look like rather than only that this one was refused, and
     lets a `setCustomValidity` message or a pattern's own `title` win
     outright -- both were written by somebody who knew more than this
     module can. A refusal whose bound the browser did not expose must never
     print "undefined" at anybody.
  `window.confirm` was the other default, and `useConfirm` had already
  replaced it everywhere but `MedicalDocumentsPanel`, which now uses it too
  -- awaited **before** the transition, per the deadlock rule above.
  `e2e/form-validation-chrome.spec.ts` is the guard, on one admin screen and
  one public page deliberately: nothing here changes a route or a row, so
  what is worth proving is that a form nobody edited is covered.
- **A number box takes digits, and the browser does not enforce that.**
  `<input type="number">` accepts `e` and `E` (scientific notation) and `+`
  in every browser, and Chromium keeps the character on screen while
  reporting `value` as the empty string. Typing a letter into the condition
  form's **Order** box therefore left a stray "e" in the field, refused
  every keystroke after it, and submitted as though the box had been left
  blank -- a form that looks filled in and arrives empty. `NumericInputGuard`
  (`src/components/system/NumericInputGuard.tsx`) is mounted in the root
  layout beside the validation chrome and covers all 26 of the app's number
  boxes, including the next one written. Three rules:
  1. **It listens for `beforeinput`, not `keydown`** -- the one event
     covering typing, pasting and drag-and-drop alike, carrying the text
     being inserted rather than a key name. A pasted "₹1,200" is judged by
     the same rule as a typed comma, and an untested keyboard layout is not
     a hole.
  2. **The judgement is on the resulting string.** A minus is meaningful in
     front and meaningless in the middle; one decimal point is fine where a
     second is not. `src/lib/numericInputGuard.ts` holds it, dependency-free
     with its own tests, and it never blocks a deletion or a value somebody
     is part-way through typing ("-", "1.", ".5").
  3. **What the field allows is read off the field**, from `step` and `min`
     -- so a price still takes 499.50 and a field with no floor still takes
     a minus. A stricter rule invented here would be one listener overriding
     forms it knows nothing about.
  The routes were the other half: `create-`/`update-treatment-category`
  accepted any finite number as `display_order` and rounded it, so a
  negative or fractional order sorted a condition somewhere nobody chose.
  Both refuse anything but a whole number of 0 or more now, re-derived
  server-side like every other figure a browser sends. And **Order** says
  what it decides on the screen itself: a number box between a price and a
  session length reads as a third measurement until it does.
  `e2e/numeric-input.spec.ts` is the guard -- the rule is unit-tested, and
  what needs a real browser is the browser's own handling being overridden.
- **A control that is disabled everywhere is a rule; one disabled by
  accident is a bug wearing a rule's clothes.** A session package's category
  is genuinely immutable *after* creation -- live purchases reference it --
  and `PackageCatalogForm` rendered that lock on the **new**-package form
  too, with the hint "cannot be changed after creation" underneath it. The
  form is opened from a flat "+ Add Package" button with no category behind
  it, so `defaultCategoryId` was never passed and every package ever created
  was pinned to `categories[0]`, the first condition by display order. The
  sentence explaining the lock is what made it survive: the screen read as
  having a reason. It is a real picker at creation now, still a plain
  read-only line on edit, and its options carry each condition's own list
  price, because every saving figure on that form is computed against it and
  choosing blind meant a trip to Conditions and back. A condition that is
  switched off is labelled rather than dropped -- a package under it is not
  on sale either way, and an option silently missing reads as data lost.
  `/api/admin/create-package` already took and re-checked `categoryId`, so
  nothing server-side moved. `e2e/package-category-picker.spec.ts` is the
  guard.
- **A switch that decides nothing is worse than no switch.** The
  session-package form carried three placement ticks -- *Show on Home page*,
  *Show on Conditions page*, *Show in Patient Dashboard* -- plus a Badge, a
  *Feature this package* ring and a Terms box. Every one of them was for the
  public programme card the consultation-first cutover deleted: `/` and
  `/conditions` carry no programme catalogue, the booking hub sells one
  consultation or one visit, and `terms` was selected into the care-plan
  offer snapshot and rendered on no screen. Three ticked boxes above the one
  switch that still worked read as a placement somebody chose. They are gone
  from the form, from `validatePackagePayload`, from the dashboard's select
  and from the table (`drop column if exists ... restrict` at the end of
  `schema.sql`, the `show_programme_prices` precedent).
  **And the switch that does decide it had no control at all.**
  `recommendable` is what lets a clinician put a programme in front of a
  patient -- the only route a programme is sold by now -- while Sessions ->
  Recommendations told admins to "turn one on under Catalog -> Packages", a
  screen with no such control. Both catalog forms have it now, and the
  package list chips *Not recommendable* rather than a badge nobody renders.
  **Home visits are not the same case and were not treated as one.** A visit
  package is still sold directly (a one-visit package is that patient's
  consultation), so `/home-visit` and the booking hub both render it: its
  badge, highlight, terms, `visible_on_home_visit_page` and
  `visible_in_dashboard` all stay. Only `visible_on_home` goes, because the
  home page carries a link band to that page and has never listed visit
  packages. `e2e/package-form-flags.spec.ts` holds both halves.
- **A session package may hold one session.** `session_count >= 2` was a
  rule from when a package was a bundle sold off a public price list: a
  one-session "package" was the consultation a patient could already buy on
  its own, so the floor cost nothing and stopped a duplicate product. Both
  halves of that stopped being true at the consultation-first cutover --
  there is no public programme catalogue and no `/book?package=` checkout,
  so a session package reaches a patient only through a recommendation their
  own clinician wrote, and "come back once more" is among the commonest
  things a clinician wants to recommend. With a floor of two it could not be
  expressed at all. `home_visit_packages.visit_count` has allowed one since
  it shipped, for the same reason read from the other end.
  Nothing about consultation-first widens: `isDirectlyPurchasable` is read
  for home-visit packages alone, since session packages have no direct
  purchase path left, so a one-session programme is still something only a
  therapist can put in front of somebody. The CHECK is dropped and re-added
  under a name of its own at the end of `schema.sql` -- a CHECK cannot be
  altered in place, and the original was created unnamed inside `create
  table`.
- **A page whose existence is a switch cannot be ISR-cached.**
  `/book-home-visit` reads `home_visit_enabled` and 404s when it is off --
  and under `revalidate = 300` that judgement was made when the page was
  *generated*, so closing the door depended on a cache being purged.
  `/api/admin/update-setting` does call `revalidatePath` for this key, which
  is why the switch appears to work; anything else that changes the column --
  a hand edit in the table editor, a data reset, a restore -- leaves the
  cached page serving a booking funnel for a service the clinic has stopped
  offering, and the patient is quoted a price for a visit nobody will make.
  It is `dynamic = "force-dynamic"` now: two reads on a page reached by a
  deliberate tap, against a door that has to be shut the moment it is shut.
  `/home-visit` stays ISR-cached -- it is a marketing page rather than a
  checkout, and the same revalidate keeps it honest.
  **And a recommendation outlives the switch.** A home-visit programme
  approved while visits were on still rendered its Accept & pay button after
  they were switched off: `check-area` answers 403, `care-plan/create-order`
  refuses, and the patient met "we couldn't work out the travel fee for this
  address" over a button that could never succeed. `CarePlanOfferCard` takes
  `homeVisitEnabled` and says the mode is paused instead -- the same rule
  that took the Pay Now button off a pay-later session, where a control the
  server refuses outright must not render. The booking hub's own subtitle
  moved with it, since "Video consultations and home visits, in one place"
  advertises the mode on the screen a patient opens to book it.
  `e2e/home-visit-disabled.spec.ts` walks it with the column flipped in the
  database rather than through the route, which is the case the cache could
  not survive.
- **Every link says it heard you, and a screen already rendered is never
  fetched again.** Two failures that both read as a dead button, and the
  Today screen had them together. Tapping a count -- "Out-of-area requests",
  "Unassigned sessions" -- was an ordinary link to
  `/admin/dashboard?section=...&tab=...`: the same route with a different
  query, which is a real navigation, so Next threw away a rendered dashboard
  and rebuilt it from ~49 queries to show markup that was already in the DOM.
  Seconds of nothing, then a jump. And the wait itself was silent, because
  the teal bar knew about `useRouter`, about `ProgressLink` and about
  `useLeavingPage`, and about nothing else -- a bare `next/link` or a plain
  `<a>` reported no work at all.
  Two answers, and both are one place rather than a rule every call site has
  to remember:
  1. **`AdminScreenLink`** (`src/components/admin/`) reads the shell's own
     navigate out of `AdminScreenNavigationProvider`
     (`src/lib/adminScreenNavigation.tsx`) and switches screens in place, the
     way the sidebar always has. It stays a real `<a>` with a real href, so
     middle-click, Copy Link Address and opening in a new tab keep working
     and a screen is still linkable; only the plain left click is
     intercepted. Outside the shell -- the admin detail routes render some of
     the same components -- the context is null and it is an ordinary anchor.
     `ProgressLink` defers to it for an admin screen href, so the shared
     dashboard surfaces (quick actions, the feed, `StatStrip`'s figures) need
     no per-call-site branch. Measured: 291ms and zero requests, against a
     full dashboard rebuild.
     The `?view=` preset travels with it -- `navigate` keeps the key when one
     is passed rather than only deleting it -- and `useSearchParams` follows
     a `pushState`, which is what lets the target screen apply the filter
     during its own render. `e2e/navigation-feedback.spec.ts` NAV-003 is the
     guard on that pair.
  2. **`LinkProgress`** (`src/components/system/`) is a capture-phase click
     listener at the root that marks pending work for any anchor the browser
     will actually act on, and releases it when the URL changes. It covers
     every link written without one of the three older mechanisms, including
     the ones written next. Four rules, all in the file: a modified click,
     an off-site href and a bare hash are left alone; a click some handler
     cancels is released on the next tick (`AdminScreenLink` cancels every
     one of its own); the URL changing is what "arrived" means; and the
     marker expires after 20s so a navigation nothing else can see cannot
     leave a bar running for ever.
- **Marking an out-of-area request served is a decision about the catchment,
  so it offers to open it.** The waitlist on Catalog -> Service Areas is
  demand the clinic had to turn away: somebody tried to book from a pincode
  nobody visits. Tapping **served** set a status and nothing else -- so the
  pincode stayed unserved, the next patient from that street met the same
  refusal, and the row saying the clinic had been there sat on a screen
  nobody would think to doubt. It now opens a dialog with two answers, and
  four rules:
  1. **It is a small form, not a yes/no**, because the one thing this app
     cannot know is what the trip costs. City and pincode come from the
     request; the travel fee is prefilled with what the clinic already
     charges in that city (the commonest of its areas' fees, ties to the
     lower) and the field **says where the number came from** -- a prefilled
     price nobody explains is a price nobody chose. A city with no areas yet
     starts at zero and says that is a placeholder rather than a price.
  2. **Declining is an answer, not a cancel.** "No, just mark served" still
     moves the status: an admin who sent somebody as a one-off has not
     decided to sell visits there. Closing the dialog outright is the third
     outcome and leaves the status alone, which is why the X is not either
     button.
  3. **The area is written first.** A request marked served against a
     pincode nobody visits is the exact state this exists to prevent, so a
     failed insert leaves the status where it was and says why.
  4. **A pincode already served is told, not offered.**
     `describeAreaPrefill` (`src/lib/homeVisitWaitlistArea.ts`, dependency-free
     and unit-tested) answers that from the areas the screen already has, so
     the dialog does not offer an insert `create-home-visit-areas` would
     refuse -- and it shows the clinic's own city and fee for it rather than
     what the request typed.
  Both routes are unchanged. `e2e/waitlist-serve-area.spec.ts` walks both
  answers against the database.

---

## Icons: solid only

`globals.css` imports `fontawesome.min.css` + `solid.min.css`, **not**
`all.min.css`. Font Awesome ships one webfont per style and a browser fetches
a style's font the moment one glyph from it renders, so a single icon from a
style costs that whole file. This app had exactly one `fa-brands` icon
(WhatsApp, in the footer, on every page — 113 KB) and exactly one
`fa-regular` icon (the calendar in `DateField` — 19 KB). Both are now inline
SVG in `src/components/visuals/BrandGlyphs.tsx`, copied verbatim from the
package's own `svgs/` so they are the same shapes rather than lookalikes.

**Writing `fa-brands fa-whatsapp` now renders nothing.** Not a fallback, not
an error — an empty inline box, silently. `npm run lint` fails on it
(`scripts/check-icon-styles.mjs`), which is the only reason that is safe.

Need an icon from another style? Add it to `BrandGlyphs.tsx`. Re-importing a
stylesheet and its webfont for one glyph is the expensive answer — though it
becomes the right one if the app ever needs a dozen brand icons, and the
check reads `globals.css`, so it passes automatically once the import is
there.

Icon names that reach the database (`mission_principles.icon`) are safe
because the route validates them against `MISSION_ICONS` in
`src/lib/mission.ts`, which is a literal array the scanner can see. Keep it
that way: an icon name built by concatenation, or accepted from a text box,
is invisible to any tooling here.

- **An error that appears off-screen is not shown, so the page goes to it.**
  `FormValidationChrome` covers what the browser refuses (`required`, `type`);
  rules a form checks in JavaScript used to say so in a banner at the top of the
  form, so on a phone the tap on Continue seemed to do nothing. Two layers now:
  `revealField(idOrElement)` (`src/lib/revealField.ts`) scrolls to and focuses
  the field, rings it with the same `data-invalid` mark, and clears it on input
  -- call it from a validator after `setError`, as both booking wizards do; and
  `ErrorAutoScroll` (mounted in the root layout) brings any banner in the app's
  error style (`[data-form-error]`, or `bg-red-50` + `border-red-200`) into view
  when it appears within ~1.5s of a tap/key/submit and is outside the viewport.
  A new form's validator should name the field, not rely on the safety net;
  `data-no-autoscroll` opts a region out.
- **Money prints through `src/lib/formatMoney.ts`, never a local
  `(paise / 100).toLocaleString()`.** Thirty components had their own copy
  and disagreed - one screen read ₹3,118.8, the next ₹3,118.80. Whole rupees
  print with no decimals (₹499); anything with paise always prints two. A
  deliberate whole-rupee rounding (`Math.round(x / 100)`) is the only other
  form, and says so where it is used.
- **Every page fits every screen shape the owner named.** `e2e/layout-audit.spec.ts`
  loads every public, patient, therapist, hospital and admin page and resizes
  it through 17 viewports covering 20:9, 19.5:9, 22:9, 16:9, 16:10, 5:3, 7:5,
  5:4 and the 12.9" iPad, checking for sideways scroll (page or panel),
  anything off the edge, silently clipped text and text or controls drawn
  over each other (`e2e/layout/layoutProbe.ts`). A new page is added to its
  list; a long unbroken string (an ID, a URL) gets `[overflow-wrap:anywhere]`;
  a segmented control is full-width with equal tabs below `sm`; a fixed pill
  centred with `left-1/2` needs `w-max max-w-[calc(100vw-2rem)]` or it wraps
  into half the screen.

- **Dark mode is a palette, not a second set of classes - write colours as
  you always have.** Settings -> Public Site -> Appearance
  (`site_settings.follow_device_theme`, off by default) lets the app follow
  the device. When it is on and the device is dark, a head script
  (`src/lib/deviceTheme.ts`) sets `<html data-theme="dark">` before first
  paint, and `DeviceThemeFollower` keeps it in step if the device changes.
  `src/app/dark-theme.css` - **generated** by `node scripts/build-dark-theme.mjs`,
  so edit the script, never the CSS - declares Tailwind 4's per-utility
  namespaces (`--background-color-*`, `--border-color-*`, `--ring-color-*`)
  for every colour in use. That is what lets one class name mean two things
  on purpose: `bg-white` turns into a dark card while `text-white` on a teal
  button stays white; `bg-teal-700` keeps the brand fill while
  `text-teal-700` lightens to read on dark; pale status tints become dark
  tints of the same hue. Rules that follow from it:
  - **A surface that must stay white in both modes uses a literal colour**,
    not `bg-white` (the footer's logo tile, the switch knob, the Appearance
    preview tiles).
  - **SVG charts use the `--chart-*` variables** in `globals.css` for ink,
    grid, axis and brand lines - a `fill="#0f172a"` attribute is invisible on
    dark. A new hard-coded colour in a chart needs a variable.
  - **Printing is always light**: the dark block is `@media screen` only.
  - A new colour family (`lime`, `pink`, ...) is covered once it is in the
    script's `HUES` list; run the script after adding one.
