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
* At most **200 rows** are painted before a "Show all" affordance appears. The page server-renders every screen at once, so an unbounded table would be HTML every admin downloads whether they open the screen or not.
* Filtering, sorting, totals and **both exports** always run over the **whole filtered set** — only what is painted is paged.

#### `ADM-SESS-002` — Assign a therapist · P0

**Steps**
1. Open a paid, unassigned session's drawer.
2. Read the assign form.
3. Select `QA Therapist A`.
4. Submit.

**Expected Result.** If the patient requested a specialist, that therapist is **preselected and marked "(requested)"**. On assignment the session becomes `confirmed`, a Google Calendar/Meet event is created (if credentials are configured), the therapist now sees it, and the patient's card shows the therapist's name. The unassigned badge decreases.
**Negative:** assigning a therapist who already has an overlapping session is refused with `This therapist already has another session that overlaps this time slot.` A session already over is refused with `This session is already over and can't be modified`. A stale submit returns `This session's status changed — please refresh and try again.`

#### `ADM-SESS-003` — Meet sync failure is recorded, retried and capped · P1

**Feature.** Google sync **must never block a booking**. Failures are recorded on the appointment, re-attempted by a **lazy sweep at the top of the admin dashboard render**, and retried by hand from Sync Health. Because that sweep makes outbound calls from inside a page render, it is capped **three ways**: a wall-clock timeout per attempt, a few appointments per sweep, and an attempts-per-appointment counter.

**Steps.** Remove or invalidate the Google credentials. Assign a therapist to a paid session. Then open **Settings → System Health**. Tap **Retry** on the failed row several times.
**Expected Result.** The assignment **succeeds** and the session is confirmed — the booking is never blocked. `google_calendar_sync_error` is recorded and the row appears in Sync Health, raising that tab's badge. Retrying increments the attempt counter; at the cap the row stays flagged as **needing a person** rather than being retried forever. A **manual Retry resets the counter.** Two overlapping attempts must not both create an event — each claims the appointment first, with a staleness window so a render that dies mid-attempt releases its row. Retrying a session that is not confirmed-with-a-therapist is refused with `Only confirmed sessions with an assigned therapist can retry Meet sync`. A concurrent retry returns `A sync attempt for this session is already running. Try again in a moment.`
**Note:** a **home visit still gets a calendar event even when `google_meet_enabled` is off** — that toggle gates the Meet conferencing only, not event creation, because the invite email is the only outbound notification this platform sends.

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

#### `ADM-CARE-001` — Recommendations: see every care plan · P0
**Steps.** Open **Sessions → Recommendations**.
**Expected Result.** Every care plan in the clinic is listed with its patient, therapist, package, status and date. A care plan is now the **only** route by which a patient buys a programme, so the clinic must be able to see them all.

#### `ADM-CARE-002` — Withdraw a recommendation · P0
**Steps.** Withdraw an **active, unpurchased** plan with the reason `Therapist on extended leave; will re-review.` Then attempt to withdraw an **accepted (purchased)** plan.
**Expected Result.** The active one closes; the patient's offer disappears; a `care_plan.withdraw` audit row is written; the route required `sessions` scope, a **mandatory reason**, and a compare-and-swap on `status='active'` (a stale attempt returns `Someone else closed this recommendation. Refresh to see it.`).
**The purchased plan cannot be withdrawn at all** — the patient has paid and the sessions exist, so the honest lane is a refund or a credit adjustment, each of which has its own screen.
**Withdrawing is deliberately the whole of that power.** There is no admin path to *edit* or *re-price* a recommendation. A recommendation that changed is a **new one written by a clinician who has seen the patient**.

#### `ADM-CARE-003` — Write a recommendation on a therapist's behalf · P0

**Feature.** One authoring implementation, two doors. This exists for when a therapist cannot reach their dashboard — on leave, off sick, gone — and a patient is still waiting to hear.

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
* Step 6: the write succeeds with **split attribution** — `authored_by` is the clinician whose judgement it is, `entered_by` is the admin who typed it. Naming only the therapist would be a quiet lie about who was at the keyboard; naming only the admin a louder one about whose judgement it is. A `care_plan.author_on_behalf` audit row is written. The route required `sessions` scope and a mandatory reason.
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
