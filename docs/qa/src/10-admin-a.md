---

## 14. Admin test plan — Part A (Today, Sessions, People, Catalog)

### 14.0 How the admin dashboard works

The whole back office is **one page** at `/admin/dashboard` making roughly forty queries. The screen you see is chosen by `?section=&tab=`. Three facts follow, and each has a testable consequence:

1. **Tab state is written with the History API, never a router navigation.** Moving between two already-rendered screens must **not** re-run the page's queries. If switching tabs shows a loading spinner or takes seconds, that is a defect.
2. **A deep link server-renders its screen.** `/admin/dashboard?section=money&tab=payouts` must paint Payouts directly — not paint Today first and jump.
3. **An unknown tab key falls back to the section's first screen.** So a stale link *looks* like it works while quietly landing somewhere else. Build links with the typed helper; never hand-write one.

**Realtime.** The dashboard subscribes to two channels: operational tables (bookings, payouts, profiles, care records) on a **short** cooldown, and catalog/settings tables on a **much longer** one. It fires on the **leading edge** — the first change lands immediately and only the burst behind it is collapsed. A refresh re-runs every query on every screen, which is why the cooldowns exist.

**Every mutating admin route writes an `admin_activity_log` row**, after the route's compare-and-swap claim, so the log cannot record a settlement or cancellation that lost its race. The write is **best-effort and never throws** — an audit failure must not block the action it describes. The log has a select policy and **deliberately no insert policy**: the service role is the only writer, so it is append-only from any session. **A generated password never appears in `details`.**

---

### 14.1 Today

#### `ADM-TODAY-001` — The Today screen · P0

**Feature.** "Everything waiting on you, in one list." Figures, queues and the activity feed on **one** screen, because splitting them meant an admin checked one and missed the other.

**Steps.** Sign in as Admin Full. The dashboard opens on **Today → Today**.
**Expected Result.** A strip of four figures, the inbox queues, and the activity feed — in that order. Each inbox row shows a **count**, a **one-line hint** saying why it matters, and links to the section/tab where that work is actually done. Rows representing **money at stake** render in red as urgent. The **Today** badge equals the sum of the inbox counts. Every row's destination must exist: tapping each row must land on a real screen, never on a section's first tab by accident.

#### `ADM-TODAY-005` — A count opens the rows it counted · P1

**Feature.** A figure or a queue row that opened an unfiltered list made the reader redo the filtering by hand, and made the number look wrong. The link carries a `?view=` preset the target screen applies on arrival.

**Steps**
1. With at least one unassigned session on record, note the **Unassigned sessions** figure on Today.
2. Tap it.
3. Read the **All Sessions** heading count and the status filter.
4. Tap **Sessions today**, then **Cash to remit**, from Today.
5. Return to **Today** in the sidebar, then open **Sessions → All Sessions** from the sidebar.
6. Sign in as **Admin Clinical** (no Money scope) and read the same strip.

**Expected Result**
* Tapping **Unassigned sessions** opens All Sessions with the status filter on **Needs a therapist**, the header count equal to the figure, and the list starting at **page 1**. Every other filter — mode, payment, therapist, patient, date range — is cleared, including any remembered on this device: a remembered filter that hid rows the figure counted is the same bug in a subtler form.
* **Sessions today** filters the date range to today; **Cash to remit** opens Money → Payouts filtered to therapists with a balance.
* The preset is **one-shot**. Returning through the sidebar drops `view` from the URL, and re-opening All Sessions shows the filters as the admin last left them, not the preset again.
* On All Sessions itself, the **No therapist**, **Today** and **Home visits** figures filter the list **in place** (no page navigation) and tapping the applied one clears it.
* An admin whose scope cannot open the target section sees the figure **without a link** — never a link into a 403.

#### `ADM-TODAY-002` — Inbox counts are live · P1
**Steps.** In a second browser, have a patient book a session. Watch the admin's Today screen without reloading.
**Expected Result.** The unassigned count and the badge update within the operational channel's cooldown. The **first** change appears immediately (leading edge); a burst of ten bookings collapses into one refresh.

#### `ADM-APPR-001` — Approve a pending patient · P0

**Steps**
1. Open **Today → Approvals**.
2. Find the row for `QA Patient B`.
3. Tap **Approve**.

**Expected Result.** The row leaves the queue and the badge decreases by one. `profiles.approved` becomes true. Patient B can now sign in and reach `/patient/dashboard` instead of `/pending-approval`. An `admin_activity_log` row records the approval with the actor, the target and the timestamp.
**Approvals live under Today, beside the inbox that counts them — never on the patients directory.** A queue is not a person.
**The screen states what it is deciding**, because the two halves are not the same decision: a therapist here is a credentials check, while a patient here registered *without* booking — anyone who genuinely attempts a payment is approved automatically at that moment. Approving a patient from this list changes what they can see, never whether they can pay. Confirm that line is present; without it a new admin cannot tell what they are being asked to judge.

#### `ADM-APPR-002` — Approve a therapist · P0
Same as above for `QA Therapist A`. **Expected Result.** The therapist can sign in and reach the dashboard, and their availability routes stop returning 403.

#### `ADM-APPR-003` — Decline an account · P1
**Steps.** Tap **Decline** on a pending row, leaving the reason blank; then with a reason.
**Expected Result.** Blank is refused (`A reason is required to decline.`). With a reason, the row leaves the queue, the account does not become approved, and the decline is audited.

#### `ADM-APPR-004` — Profile change requests · P1
**Preconditions.** `PAT-PROF-001` submitted a gated field change.
**Steps.** Approve one request; decline another with a reason.
**Expected Result.** Approving writes the new value onto the profile; declining does not. Both are audited. A stale decision on an already-decided request is refused with `This request has already been reviewed`.

#### `ADM-RISK-001` — The Risk queue · P1

**Feature.** Suspicious patterns surface here, written by a **bounded lazy sweep after the Today render** — a wall-clock budget checked between rules, and a five-minute minimum interval, because realtime refreshes this page on every booking.

**Steps.** Open **Today → Risk**. Read the list, then open one signal.
**Expected Result**
* **A flag is never an accusation and never carries a penalty.** Nothing is suspended, held or hidden because a rule fired. **The Risk tab carries no action buttons** — acting on a finding means going to the screen that owns that action and doing it deliberately, with its own audit row. If an action button appears here, that is a defect.
* Each signal shows a severity (`Low` / `Worth a look` / `Look now`), a status (`Needs a look` / `Being reviewed` / `Nothing in it` / `Acted on`), and **links to the rows behind it** — `evidence` stores row ids, not a score, because an admin who can only see a verdict cannot disagree with it.
* The eight rules are `contact_leak`, `completion_without_payment`, `early_completion`, `cash_variance`, `contact_reveal_volume`, `manual_adjustment_volume`, `plan_conversion_low`, `post_consultation_dropout`. **The last two ship disabled** — a threshold invented before anyone knows the clinic's normal rate fires on everyone or on nobody.

#### `ADM-RISK-002` — Reviewing a signal requires a real note · P1
**Steps.** Review a signal with a note of `ok` (2 characters), then with `Checked the two sessions, both legitimate.`
**Expected Result.** The short note is refused — the minimum is **ten characters**, enforced by a CHECK, because "dismissed" with no reason reads the same as "not read". Reviews are **append-only**. Closing a signal frees its slot, so a repeat after a dismissal is raised **fresh** — that is correct, it is new information.

#### `ADM-RISK-003` — Thresholds are editable, and the queue is full-scope only · P1
**Steps.** Edit a rule's threshold on the tab. Then sign in as Admin Ops and open Today.
**Expected Result.** The threshold saves and the next sweep uses it. As Admin Ops, the **Risk tab is not shown, and the page does not even fetch the signals** — a signal names a colleague and quotes what they wrote.

---

### 14.2 Sessions

#### `ADM-SCHED-001` — Schedule (calendar) · P1
**Steps.** Open **Sessions → Schedule**. Navigate months. Tap a day with sessions. Tap one session.
**Expected Result.** The calendar shows sessions by day. Tapping a day opens its panel; tapping a session opens the **same `SessionDetailDrawer`** that All Sessions opens. **There is one detail surface, not two.**

#### `ADM-SESS-001` — All Sessions is one filterable list · P0

**Feature.** All Bookings, Session Story, the calendar's day panel and the home-visit queue were four lists over the same rows. They are now **one** list plus the calendar, both opening the same drawer. **If you find yourself wanting a second list of sessions, the answer is a filter.**

**Steps.** Open **Sessions → All Sessions**. Apply a status filter, a mode filter and a date range. Reload the page. Then change the page size and reload again.
**Expected Result**
* One list containing every session, video and home visit alike. Home-visit specifics (address, travel fee, cash) are a **panel inside the drawer**, not a parallel screen.
* Filters are **remembered per browser** — but **the date range is not**, because it goes stale.
* The list ends in the standard pager: a **Show N per page** field (default **25** on this screen — it is the one an admin lives on, where ten rows made every working day a paging exercise; other lists keep the shared default of 10, remembered per browser under this list's own key), Previous/Next that grey out at the ends, and an "x–y of n" count. There is **no arbitrary row cap with a "Show all" escape hatch** — that was the old behaviour, and "Show all" then painted every row anyway, which is the thing the pager replaced.
* Filtering, sorting, totals and **both exports** always run over the **whole filtered set** — only what is painted is paged. Otherwise a range total would start describing a page.

#### `ADM-SESS-002` — Assign a therapist · P0

**Steps**
1. Open a paid, unassigned session's drawer.
2. Read the assign form.
3. Select `QA Therapist A`.
4. Submit.

**Expected Result.** The drawer's control reads **Assign a therapist**, never "Reschedule / Reassign" — nothing has been reassigned on a session nobody has ever been assigned to. If the patient requested a specialist, that therapist is **preselected and marked "(requested)"**, with the line "Patient requested this therapist" above the picker. An unassigned row on **All Sessions** and on the **Schedule** day panel carries a **Tap to assign** chip, and the reschedule control below the assign form is the one to use when the time has to move too. A **home visit** is assigned from the visit panel in the same drawer, not from a second copy of the online form. On assignment the session becomes `confirmed`, a Google Calendar/Meet event is created (if credentials are configured), the therapist now sees it, and the patient's card shows the therapist's name. The unassigned badge decreases.
**Negative:** assigning a therapist who already has an overlapping session is refused with `This therapist already has another session that overlaps this time slot.` A session already over is refused with `This session is already over and can't be modified`. A stale submit returns `This session's status changed — please refresh and try again.`

#### `ADM-SESS-003` — Meet sync failure is recorded, retried and capped · P1

**Feature.** Google sync **must never block a booking**. Failures are recorded on the appointment, re-attempted by a **lazy sweep at the top of the admin dashboard render**, and retried by hand from Sync Health. Because that sweep makes outbound calls from inside a page render, it is capped **three ways**: a wall-clock timeout per attempt, a few appointments per sweep, and an attempts-per-appointment counter.

**Steps.** Remove or invalidate the Google credentials. Assign a therapist to a paid session. Then open **Settings → System Health**. Tap **Retry** on the failed row several times.
**Expected Result.** The assignment **succeeds** and the session is confirmed — the booking is never blocked. `google_calendar_sync_error` is recorded and the row appears in Sync Health, raising that tab's badge. Retrying increments the attempt counter; at the cap the row stays flagged as **needing a person** rather than being retried forever. A **manual Retry resets the counter.** Two overlapping attempts must not both create an event — each claims the appointment first, with a staleness window so a render that dies mid-attempt releases its row. Retrying a session that is not confirmed-with-a-therapist is refused with `Only confirmed sessions with an assigned therapist can retry Meet sync`. A concurrent retry returns `A sync attempt for this session is already running. Try again in a moment.`
**Note:** a **home visit still gets a calendar event even when `google_meet_enabled` is off** — that toggle gates the Meet conferencing only, not event creation, because the invite email is the only outbound notification this platform sends.

#### `ADM-SESS-003b` — Patient and therapist join without being admitted · P1

**Feature.** Meet holds anyone it does not recognise in a waiting room until the meeting's owner admits them, and a patient signs in with whatever Google account they have — so without this, every session needed the clinic's own account to let both parties in, one at a time. Each new session's meeting is opened at creation. Settings → Booking Rules → **Join Without Approval** is the switch; Settings → System Health → **Waiting Room** lists the sessions where it did not take.

**Steps.** With the switch **on**, confirm a paid session. Open its Meet link in a browser signed in as a Google account that is *not* on the invite. Then open **Settings → System Health**.
**Expected Result.** The link goes **straight into the call** — no "asking to be let in", and nobody has to admit anyone. `meet_access_open` is `true` and the session is **not** in the Waiting Room panel. The Join button's caption reads `Opens straight into the call — sign in to Google if asked.` once the join window is open, and `Opens N minutes before your session.` before it.
**Negative:** with a refresh token minted before the `meetings.space.settings` scope (or the Google Meet API not enabled on the Cloud project), the **booking still succeeds and the link still works** — only the waiting room stays on. The session appears under Waiting Room with the 403 explained, is retried a couple of times automatically, then flagged as **needing a person**. **Open** re-attempts it and re-arms those attempts; on a session with no Meet link yet it is refused with `This session has no Meet link yet — retry the Calendar sync first`, and on a cancelled one with `This session is cancelled — its Meet space is gone`.
**Note:** open access removes the **knock**, not the **sign-in**. A meeting organised by a personal Gmail account still requires every participant to be signed in to *some* Google account; only moving the organising account to Google Workspace allows a patient with no Google account at all to join.

#### `ADM-SESS-004` — Edit, cancel, reopen and restore a session · P1

| Action | Expected |
| --- | --- |
| Edit a booking's time/therapist | Saves, re-checks conflicts, audits. A session already over: `This session is already over and can't be modified` |
| Cancel with refund | The session is cancelled, the refund is processed, Money → Summary's Net Revenue drops while Gross is unchanged |
| Reopen a completed session | Only a completed session can be reopened (`Only completed sessions can be reopened.`); audited |
| Restore a cancelled/no-show session | Allowed only from those two states (`Only a cancelled or completed (no-show) session can be restored.`); a second attempt: `This session has already been restored.` |
| Mark paid by cash | A session already paid: `This session is already marked as paid` |

#### `ADM-ROST-001` — The Roster opens on therapists, not on a date · P0

**Feature.** The Roster is the clinic's planning record. It opens on a **list of therapists** rather than a calendar date and an eighteen-column grid, and it uses the **same editor** the therapist's own screen uses.

**Steps.** Open **Sessions → Roster**. Read the landing view. Open `QA Therapist A`.
**Expected Result.** A list of therapists with a summary of what each works, plus their leave state. Opening one shows the **period editor**, not an hourly grid. The periods match exactly what the therapist saved in `THR-AVAIL-001`.

#### `ADM-ROST-002` — An admin saves a therapist's weekly schedule · P1
**Steps.** Change Therapist A's Friday to `09:00–12:00` and save.
**Expected Result.** Saved through the same compare-and-swap function, with the same stale-save 409 and the same double-click no-op success. The therapist's own screen shows the change. **No appointment is moved.**

#### `ADM-ROST-003` — Set a date exception · P0
**Steps.** For Therapist A, set `2026-09-15` to `14:00–18:00` with the reason `Clinic audit in the morning`. Save. Then look at 22 September (the next Tuesday) and at the weekly template.
**Expected Result.** Only 15 September changes. **Every other Tuesday still shows the weekly template's hours, and the weekly template itself is untouched.** Setting a date exception replaces that **whole day** in one function — it is not a partial merge.

#### `ADM-ROST-004` — Set leave · P1
**Steps.** Put Therapist C on leave `2026-09-14`–`2026-09-18`.
**Expected Result.** `profiles.on_leave` is set; the roster shows them off; **the weekly schedule is untouched** and is still there when leave is removed.

#### `ADM-ROST-005` — Roster authorization on every route · P0
**Steps.** With a **therapist's** cookie, call `POST /api/admin/save-therapist-availability` and `POST /api/admin/set-availability-exception`. With **Admin Finance's** cookie, call both again.
**Expected Result.** All four return **403**. The roster is `sessions` scope; Finance cannot open Sessions at all.

#### `ADM-DELIV-001` — Delivery answers operational questions, not financial ones · P1
**Steps.** Open **Sessions → Delivery**.
**Expected Result.** No-show rate, cancellation rate, repeat-booking rate and sessions-per-therapist. **These live under Sessions, not Money** — a no-show rate is about how the clinic runs, not about its books. All three metric slices (summary, breakdown, delivery) are computed from **one pass** of the same maths, so a figure here can never contradict the same figure on Money.

#### `ADM-MONEY-GW-001` — Goodwill: take an amount off one session · P0

**Feature.** The lane for a session cut short, a therapist who ran late, or a patient in genuine hardship. Without it these are settled outside the system, where nobody can see them and the books never learn they happened.

**Preconditions.** An **unpaid** session on a ₹1,200 category. Signed in as an admin with **Money** scope.

**Steps**
1. Open the session from **Sessions → All Sessions** and find **Goodwill** in the drawer.
2. Enter `200` and a two-character reason. Submit.
3. Replace the reason with `Their last session was cut short by a connection problem.` Submit.
4. Re-open the drawer.
5. Separately, try `2400` (more than the session costs) on another unpaid session.
6. Separately, try it on a **paid** session.

**Expected Result**
* Step 1: the panel states the session price and says plainly that this reduces what the patient is asked for, and refunds nothing, because nothing has been paid.
* Step 2: **refused.** Under ten characters is rejected by the route and by a CHECK on the column — a discount nobody can explain a month later is indistinguishable from a mistake.
* Step 3: applied. The row records **all four facts**: list price `120000`, discount `20000`, source `goodwill`, and the reason. A `payment.goodwill_discount` audit row is written.
* Step 4: the drawer shows the amount, what they now pay, and the reason. It is **not** re-editable — the patient has been quoted it.
* Step 5: **refused**, not applied at ₹1. This is a number typed with the price on screen beside it, so more than the price is a typo (2400 for 240), and quietly charging ₹1 is worse than saying no. *(A configured offer behaves differently and is floored — see `ADM-SET-023`.)*
* Step 6: **409** — *"Refund it instead."* Money that has moved comes back through the refund route, with its own Razorpay call and its own audit.
* A **Clinical** or **Operations** admin gets 403: this changes what somebody is charged, which is a money capability whatever the reason for it.

#### `ADM-MONEY-GW-002` — What discounting cost · P1
**Steps.** Apply a goodwill discount and let a first-session offer run, then open **Money → Costs**.
**Expected Result.** A **Discounts given** figure, split by rule — the offer, goodwill, promo codes and both halves of an invite, each line appearing only when it has something behind it. It is **stated, not deducted** — the note says so — because a discount means less was collected and is already inside gross revenue as a smaller number; subtracting it from profit would count it twice. If Operating profit drops by the discount amount, that is a P0 defect.

#### `ADM-PROMO-001` — Create a campaign · P1
**Steps.** As a **Money** admin, open **Money → Costs → Promo codes**. Switch codes on. Create `WELCOME200`, ₹200 off, total 50 uses, 1 per patient. Then try each of: a code with a hyphen in it; a percentage of 150; an end date before the start date; a second code called `WELCOME200`.
**Expected Result.** The first saves and appears as **Running**. Each of the four is refused with a sentence naming the problem, not a raw database error. A `promo.create` audit row is written for the one that saved. A **Clinical** or **Operations** admin gets 403 on the route: this decides what every patient who types the code pays, which is a money capability however much it reads like catalog data.

#### `ADM-PROMO-002` — A used code is paused, never deleted · P1
**Steps.** Have a patient claim a code at checkout, then try to delete it. Then pause it and have another patient try it.
**Expected Result.** Delete is **not offered** on a code that has been claimed, and the route refuses it with *"switch it off instead"* — a paid session pointing at a campaign nobody can name cannot answer which rule gave the money away. Pausing works, and the next patient is told the code is **no longer available** rather than "not recognised".

#### `ADM-PROMO-003` — The cap means what it says · P0
**Steps.** Create a code capped at **1** total use. Open checkout for it as patient A and pay. Then try it as patient B.
**Expected Result.** Patient B is refused with *"That code has been fully claimed."* Repeat with patient A abandoning checkout instead of paying: after **30 minutes** the claim frees up and patient B can use it. A cap that can be exceeded by opening two checkouts is a P0 defect.

#### `PAT-PAY-FREE-001` — The payment screen quotes what it charges · P0
**Steps.** As a patient with a first-session offer running (say 25% off), reach step 3 of the booking wizard.
**Expected Result.** The summary shows the session fee **struck through**, the discount named on its own line, and a **Total**. The button reads **Pay ₹<total> Now** with that same total. If the button quotes the list price while Razorpay opens at the discounted figure — or the reverse — that is a P0 defect: quoting one number and charging another is the one thing a payment screen must never do.

#### `PAT-PAY-FREE-002` — A 100%-off code books without paying · P0
**Steps.** Create a promo code at **100%** off. As a patient, apply it at step 3.
**Expected Result.** Total reads **Free**, the lock line changes to *"Nothing to pay — your discount covers this session in full"*, and the button reads **Confirm booking — free**. Tapping it books the session with **no Razorpay screen at all**. The session appears in the patient's dashboard as confirmed or pending exactly like a paid one. Being charged ₹1 instead is a P0 defect — that was the old behaviour and it charges a figure nobody was quoted.

#### `PAT-PAY-FREE-003` — Free is decided by the server, never the browser · P0
**Steps.** With no discount running, POST to `/api/appointments/confirm-free` with a real unpaid appointment id (browser console or curl, signed in as that patient).
**Expected Result.** **409**, *"This booking still has an amount to pay."*, and the booking stays **unpaid**. If a booking can be confirmed free by asking, every session in the app is free.

#### `ADM-MONEY-FREE-001` — A free session still shows in the books · P1
**Steps.** After `PAT-PAY-FREE-002`, open **Money → Costs** and the session's own drawer.
**Expected Result.** The booking records the full price as list price, the whole of it as the discount, and `promo_code` as the source — so **What discounting cost** includes it. Amount paid is **₹0** and there is no payment/transaction row, because no money moved. A free session that recorded nothing would make the giveaway invisible, which is the figure that decides whether the campaign continues.

#### `ADM-INVITE-001` — Invites: the two halves · P1
**Steps.** As a **Full** admin, open **Settings → Booking Rules → Patient invites**. Switch on, set the friend's welcome to ₹300 and the reward to ₹200, and save. Open a patient's dashboard.
**Expected Result.** The panel previews the exact sentence the patient will read, and it says the reward arrives **once their friend has had a session** — not on a signup. The patient's dashboard shows their own code, formatted in two halves, with a copy button.

#### `ADM-INVITE-002` — What an invite refuses · P0
**Steps.** As the code's owner, try to use your own code. As a patient who has already paid for a session, try to use somebody's code. As a patient who has already used one, try a second.
**Expected Result.** All three refused, each with its own sentence: *"That's your own invite code."*, *"An invite code can only be used before your first session."*, *"You've already used an invite code."* The entry field is **not shown at all** to a patient who has already paid or already claimed — a field that can only refuse is worse than no field. A patient reaching the API directly gets the same three answers; none of these rules lives only in the browser.

#### `ADM-INVITE-003` — A promise already made is kept · P1
**Steps.** Have a patient claim an invite while the welcome is ₹300. Lower it to ₹100, then switch invites off entirely. Open that patient's checkout.
**Expected Result.** They still get **₹300** off. Amounts are snapshotted at claim, and the switch stops new claims rather than withdrawing one already made. Charging them the new figure — or nothing — is a P0 defect.

#### `PAT-PAY-DSC-001` — The patient sees what they were given · P1
**Steps.** As a patient who received a discount, open **Payments** and tap the receipt.
**Expected Result.** Three lines: the session price struck through, the discount named and negative, and **You paid**. A receipt that silently printed the lower number would tell the patient nothing about having been given something, which is the entire value of an offer.

#### `ADM-CARE-001` — Recommendations: see every care plan · P0
**Steps.** Open **Sessions → Recommendations**.
**Expected Result.** Three bands, in this order: **Waiting for your decision**, **Waiting on a patient**, **Answered and closed**. Every care plan in the clinic is listed with its patient, therapist, package, status and date. A care plan is now the **only** route by which a patient buys a programme, so the clinic must be able to see them all.
The first band **renders even when empty**, saying so. A section that disappears when there is nothing in it gives an admin no way to tell "nothing waiting" from "I am on the wrong screen".

#### `ADM-CARE-004` — Approve a recommendation · P0

**Feature.** A therapist's recommendation is a bill as well as a clinical note, and the clinic that carries it sees one before the patient is asked to pay it.

**Preconditions.** `care_plan_requires_approval` is **on** (default, at Settings → Booking Rules). `THR-CARE-001` has been submitted.

**Steps**
1. Open **Today → Overview** and read the Clinical group of the action inbox.
2. Follow **Recommendations waiting for approval** to the queue.
3. Read the card: patient, therapist, programme, sessions, price, frequency, the clinician's reasoning and their instructions to the patient.
4. Note the order of the cards and what the badge on each one says.
5. Tap **Approve**.
6. Check the patient's Suggested Sessions screen.
7. Attempt the same decision a second time.

**Expected Result**
* Step 1: the count is there, and it turns **urgent** only once something has been waiting over four hours — never merely because the queue is non-empty. A badge that is always on is a badge nobody reads, and this is the one queue with a patient on the other side of it who has been told nothing at all. The hint names how many are late.
* Step 2: the link lands on `?section=sessions&tab=recommendations` — the figure and the list it opens must agree.
* Step 4: the queue is **oldest first** — every other list on this screen is a record and reads newest-first, but this is work, and the person waiting longest is served next. Each badge reads **how long** it has waited (`Waiting 3 hours`), not the date it arrived; past four hours it turns red. A card that reads `2 September` when the thing arrived nine minutes ago tells an admin nothing they can act on.
* Step 4: where the patient still has unused sessions **or visits** on a live programme, the card says so in amber. The figure comes through the same ledger helper every other balance surface uses, so it cannot disagree with Catalog → Purchases after the ledger switch is flipped. It is **stated, never acted on** — a patient with sessions left may well need a different programme, and the clinician has seen them. This is the commonest reason to turn one down, and an admin previously had to leave the queue to find it out.
* Step 5: **one tap, no reason asked.** Approving is the outcome this queue exists to reach, and demanding a sentence meaning "fine" twenty times a day is how a reason column fills with `ok` and stops being worth reading; a plain approval's evidence is who and when, both already on the row. The plan becomes `active`; `reviewed_by` and `reviewed_at` are stamped; a `care_plan_reviews` row records the decision and the reviewer with a null reason; a `care_plan.approve` audit row is written. **`care_plan_versions.expires_at` is stamped now** — the patient's answering window starts at approval, not at authoring, so a plan that waited in the queue does not arrive with its time already spent.
* Step 6: the recommendation is now visible and purchasable.
* Step 7: **409** — `Someone else decided this one first.` The decision is a compare-and-swap on `pending_review`, so two admins in the queue together cannot both decide.

#### `ADM-CARE-008` — A stale offer is caught before the patient meets it · P0

**Feature.** Checkout re-reads the package and refuses on a mismatch rather than charging a different amount. On its own that means the *patient* discovers the clinic's stale data, by having their payment refused at the last step.

**Steps.** With a recommendation queued, go to **Catalog → Packages** and change that package's price. Come back and tap **Approve**. Then tap **Turn it down**.
**Expected Result.** The approval is **refused** with a sentence naming the drift — *"This was written at ₹9,000 and the programme now costs ₹9,500. Approving it would quote one figure and charge another."* The plan is still queued and `reviewed_by` is still null: refused, not half-applied. Deactivating the package or clearing its **recommendable** flag refuses the same way.
**Turning it down still works.** Refusing to let an admin close a thread because its package moved would trap exactly the recommendation that most needs closing.

#### `ADM-CARE-005` — Turn a recommendation down · P0
**Steps.** On a queued recommendation, tap **Turn it down**. Submit with the reason `ok` (two characters), then with `This patient still has four unused sessions on their current plan.`
**Expected Result.** The two-character reason is **refused**, by the route and by a CHECK on `care_plan_reviews` — a rejection is what the therapist acts on, so it owes them a sentence, and one with none reads the same as one nobody got round to. With a real reason the plan becomes `rejected`; a `care_plan_reviews` row and a `care_plan.reject` audit row are written; the patient never sees it. The therapist sees it as something needing them, with the reason (`THR-CARE-007`) — **they rewrite; an admin does not edit their judgement**. The closed thread frees the one-open-plan slot immediately.

#### `ADM-CARE-006` — Approve with different numbers · P0

**Feature.** The middle case, and the one whose honesty is in the plumbing rather than the button.

**Steps.** On a queued recommendation, tap **Approve with changes**. Change the session count chip and the frequency. Submit with the reason `Frequency reduced to match what this patient can attend.`

**Expected Result**
* The plan becomes `active` and the patient is offered the **new** numbers.
* **The therapist's original version is untouched** and still readable in the thread, marked superseded. A version is append-only; rewriting one under a clinician's name would be a lie about who decided what, and the trigger refuses it regardless.
* The new version carries `authored_by` = the **therapist** and `entered_by` = the **admin**. Check both in the database — this is the assertion the whole feature turns on.
* The `care_plan_reviews` row records `edited_and_approved`, and a `care_plan.edit_and_approve` audit row is written.
* The programmes offered in the change panel are **narrowed to that session's own condition**, exactly as on the therapist's own dialog.

#### `ADM-CARE-007` — The switch · P1
**Steps.** At **Settings → Booking Rules**, turn **Approve recommendations before the patient sees them** off. Have a therapist submit a recommendation.
**Expected Result.** It publishes on save and the patient sees it immediately, exactly as before the review step existed. The therapist's panel copy changes to match. Turn it back on afterwards — the rest of the suite assumes the default.
The setting **fails closed**: with the column unreadable, a submission is held rather than published. That is the opposite direction from `contact_scan_mode`, and deliberately so.

#### `ADM-CARE-002` — Withdraw a recommendation · P0
**Steps.** Withdraw an **active, unpurchased** plan with the reason `Therapist on extended leave; will re-review.` Then attempt to withdraw an **accepted (purchased)** plan.
**Expected Result.** The active one closes; the patient's offer disappears; a `care_plan.withdraw` audit row is written; the route required `sessions` scope, a **mandatory reason**, and a compare-and-swap on `status='active'` (a stale attempt returns `Someone else closed this recommendation. Refresh to see it.`).
**The purchased plan cannot be withdrawn at all** — the patient has paid and the sessions exist, so the honest lane is a refund or a credit adjustment, each of which has its own screen.
Withdrawal also covers a plan **still waiting for approval** — refusing would leave the queue holding a thread nobody intends to approve while the patient's one-plan slot stayed taken.
**There is no admin path to *edit* a version.** Approving with different numbers (`ADM-CARE-006`) writes a **new** one attributed to the clinician; it does not change theirs, and no route anywhere can set a price.

#### `ADM-CARE-003` — Write a recommendation on a therapist's behalf · P0

**Feature.** One authoring implementation, three doors. This one exists for when a therapist cannot reach their dashboard — on leave, off sick, gone — and a patient is still waiting to hear.

**Steps**
1. On **Sessions → Recommendations**, open the authoring panel.
2. Choose the session — it must be a **completed session that the named therapist ran**.
3. Read which programmes are offered.
4. Fill the same four clinical fields as `THR-CARE-001`.
5. Read the text at the submit button.
6. Enter the reason `Therapist on leave; patient waiting since Tuesday.` and submit.
7. Then change the chosen session to a different one and observe the draft.

**Expected Result**
* Step 3: programmes are **narrowed to that session's own condition**, exactly as on the therapist's dialog.
* Step 5: **whose name it goes out in is stated at the button**, not in a subtitle two screens up.
* Step 6: the write **publishes directly**, without passing through the review queue — the admin writing it is the approver, so their own queue would decide nothing. It succeeds with **split attribution** — `authored_by` is the clinician whose judgement it is, `entered_by` is the admin who typed it. Naming only the therapist would be a quiet lie about who was at the keyboard; naming only the admin a louder one about whose judgement it is. A `care_plan.author_on_behalf` audit row is written. The route required `sessions` scope and a mandatory reason.
* Step 7: **the draft is dropped** when the session changes, so a package for someone else's condition cannot be carried across.
* With **no** eligible session or **no** recommendable package, the panel **still renders** and says which of the two is missing. An admin opens this screen because a patient is waiting; a panel that is simply absent reads as a feature that does not exist.
* The rules are **not weaker than the therapist's door**: the package still comes from the admin whitelist, the source must still be a completed session that therapist ran, and the text is still scanned.

#### `ADM-NEWB-001` — New Booking · P1
**Steps.** Open **Sessions → New Booking**. Create a booking for `QA Patient A` with `QA Therapist A` at a chosen slot.
**Expected Result.** The booking is created server-side with the same re-derivation as the patient route. **An admin has a lead-time override** (there is somebody on the phone arranging the exception) where the patient route has none. Missing fields are refused with `Missing appointmentId, therapistId, or slotDateTime` / `Choose a patient.` / `Choose a treatment category.` The booking is audited.

---

### 14.3 People

#### `ADM-PEOP-001` — Patients directory · P1
**Steps.** Open **People → Patients**. Filter, page, and export.
**Expected Result.** A paged list ending in the standard pager. **Approvals are not here** — they are under Today. Below the directory sits the **condition requests** area, whose badge counts what is waiting.
**Exports:** every admin export offers **CSV and PDF** from one column definition, so the spreadsheet and the printable document cannot describe different tables. Both cover the **whole filtered set**, not the current page. Every export carries a **subtitle naming what the rows are scoped to** — a printed table nobody can date is worthless. **Nothing in the admin dashboard exports JSON.**

#### `ADM-PEOP-002` — Global search · P2
**Steps.** Use the admin search to find `QA Patient A` and `QA Sunrise Hospital`.
**Expected Result.** Results are grouped by entity type and link to the right detail surface.

#### `ADM-PEOP-003` — Patient detail · P1
**Steps.** Tap a patient row. Then open `/admin/dashboard/patients/<id>` directly.
**Expected Result.** Tapping opens an **overlay modal**; the direct URL renders the **same content as a full page**. The detail shows sessions, purchases, notes, ratings, contact edit and password reset. `ProfileSessionList` and the purchase modals take `canSeeMoney` / `canManageSessions` — **a control an admin's scope cannot call must not render**, or they get a 403 with nothing to explain it.

#### `ADM-PEOP-004` — Condition access grants and change requests · P0
**Steps.** Approve a therapist's access-grant request. Then approve a patient's condition change request. Then approve a **therapist-submitted** edit for a re-triaged patient.
**Expected Result.** The grant lets the therapist edit that patient's record. **Approving a change MERGES; it never replaces** — see `THR-HP-004`. Revoking a grant that is not approved is refused with `Only an approved grant can be revoked`. A stale decision returns `Someone else reviewed this. Refresh to see what they said.`

#### `ADM-PEOP-005` — Therapists directory · P1
**Expected Result.** A paged list with approval state, active state, leave state, team visibility, revenue share and rating visibility.

#### `ADM-PEOP-006` — Therapist detail and revenue share · P0
**Steps.** Open `QA Therapist A`. Set **Revenue share %** to `60`, and the home-visit share to `65`. Save. Then try `-5` and `150`.
**Expected Result.** Valid values save and immediately change the therapist's Earnings and the Money screens' split. Invalid values are refused with `Enter a percentage between 0 and 100.` The change is audited.

#### `ADM-PEOP-007` — Suspend and restore a therapist · P1
**Steps.** Toggle Therapist A inactive, then active.
**Expected Result.** While inactive: their dashboard redirects to `/account-suspended`, their API routes 403, they disappear from `/team` and from `?therapist=` resolution, and they cannot be assigned. Restoring reverses all of it. **Their existing appointments are unchanged.**

#### `ADM-PEOP-008` — Partners · P1
Covered by `HOS-AUTH-002`, `HOS-MONEY-*`. Additionally: **Copy invite link**, **Update revenue share**, **Set active/inactive**, **Reset password**, **Referral capacity note**, and **Decline referral** (reason mandatory) all work and are audited.

#### `ADM-PEOP-009` — Reset a password · P1
**Steps.** Reset Patient A's password from the detail page.
**Expected Result.** A new password is generated and shown **once**. **It is never written into the audit log's `details`** — the log is readable by every admin, so who reset what and when is the part with audit value. The patient can sign in with the new password and is prompted to change it.

---

### 14.4 Catalog

#### `ADM-CAT-001` — Create a treatment category · P0

**Steps**
1. Open **Catalog → Conditions**.
2. Tap the create control.
3. Tap **Category Name**. Enter `QA Back & Spine Care`.
4. Tap **Price (₹)**. Enter `1999`.
5. Tap **Session Length (min)**. Enter `60`.
6. Tap **Order**. Enter `1`.
7. Tap **Button Text**. Enter `Book Assessment`.
8. Optionally paste a **Cover Image URL**.
9. Save.

**Expected Result.** The category is created and appears on `/` and `/conditions` (allow for ISR if not on `next dev`), in the `/book` concern dropdown as `QA Back & Spine Care — ₹1,999 / 60 min`, and as an option when creating a package. The cover image is a **plain URL an admin pastes**, not a Storage upload, rendered through a plain `<img>`; a row with no image shows the shared **placeholder panel at the same height**, never a broken-image state.
**Negatives:** `Missing title, priceInr, or durationMinutes`; `Price must be a positive number`; `Session length must be a positive number of minutes`; `Order must be a number`.

#### `ADM-CAT-002` — Edit, reorder, deactivate, delete a category · P1
**Expected Result.** Editing the price changes what `/book` charges **for new bookings** and is re-derived server-side at booking time. Reordering changes the display order everywhere. Deactivating removes it from public surfaces and refuses new bookings against it (`That concern isn't available any more. Please pick another one.`) while **leaving existing appointments untouched**. Deleting a category referenced by a live purchase must not silently break that purchase.

#### `ADM-CAT-005` — Create a session package · P0
**Steps.** Create Package P1 exactly as specified in §8.11.
**Expected Result.** Saved. The **Category is set once at creation and locked afterwards** — live purchases reference it. The package becomes available to therapists as a recommendable programme for that condition **only**. On the public site it appears as a card with **no Buy button**, showing instead *"Arranged by your therapist after your first session."*
**Negatives:** the five validation messages in §8.11.

#### `ADM-CAT-006` — Editing a package never changes what was already sold · P0
**Steps.** After Patient A has purchased P1 (6 sessions, ₹9,999), change P1 to 4 sessions and ₹12,000. Then open the patient's package widget and the admin's Purchases row.
**Expected Result.** The purchase still reads **6 sessions** at the price paid. `sessions_granted` and `package_snapshot` are **frozen by trigger**. **Never resolve a purchased entitlement by joining the live catalog row** — if the patient's widget now says 4 sessions, that is a P0 defect.
**[SQL] confirmation:** attempting `update patient_package_purchases set sessions_granted = 4 where id='<id>'` **raises**.

#### `ADM-CAT-007` — Package rules reach the booking · P1
**Steps.** With P1's minimum gap `24h` and max `3`/week, have the patient attempt to book two sessions 12 hours apart, and four in one week.
**Expected Result.** Both refused by the batch rules layer, with readable messages. Changing the rule in the catalog changes the refusal for **new** scheduling attempts.

#### `ADM-CAT-010` — Service areas · P0
**Steps.** Create Area 1 and Area 2 from §8.13. Then try to create a third area containing `560038`.
**Expected Result.** Both save. The third is refused with `Another service area already covers that pincode.` (or `Every pincode in that list is already a service area.`). Other negatives: `Enter at least one pincode.`, `Enter a valid 6-digit pincode.`, `City is required.`, `Travel Fee must be zero or a positive number.`
**Dependency:** creating `560038` makes `/book-home-visit` accept it; deleting it makes the same pincode fall through to the waitlist. **Re-checked server-side at every purchase route** — never trust a serviceability answer the browser already has.

#### `ADM-CAT-011` — The home-visit waitlist · P2
**Expected Result.** Entries from `PAT-HV-003` appear with status `new`, raising the Service Areas badge. Updating a status clears the badge. `Unknown status` is refused for an invalid value.

#### `ADM-CAT-014` — Purchases · P1
**Steps.** Open **Catalog → Purchases**. Open a package purchase's detail modal; then a home-visit purchase's.
**Expected Result.** Both list every purchase with balances. The detail modals are **viewer-scoped, not role-branched** — the route queries with the caller's own RLS-scoped client, so a row coming back **is** the authorization. Money controls inside the modal render only for an admin with `money` scope.
Admin actions available here: **extend expiry** (invalid dates refused with `Invalid newExpiresAt`), **reassign the locked therapist** (touches **future sessions only** — completed ones keep whoever actually ran them), **refund**, **restore a session**, and **grant / reverse / revive credits**.

#### `ADM-CAT-015` — Credit adjustments require a reason · P0
**Steps.** Grant 2 extra sessions with the reason `Goodwill` (7 characters), then with `Goodwill after a cancelled session.`
**Expected Result.** The short reason is refused — `admin_adjust` is the **only** entry type with free-form deltas and the **only** one requiring a reason, **ten characters minimum, enforced by a CHECK** so it holds for any caller. The valid one succeeds and appends a ledger row. **An admin can change any balance and cannot change any history.**
**[SQL]:** `update session_credit_ledger …` and `delete from session_credit_ledger …` both **raise** — append-only by trigger, not by RLS, because every route writes with the service role.
