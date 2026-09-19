## 17. Sign-off

### 17.1 What the run should have left behind

Check the database matches this before signing anything. A mismatch is either a defect you have not written up or a step you skipped.

| | Should be |
| --- | --- |
| Conditions | Three, one carrying an uploaded and positioned cover |
| Programmes | P1 (6 sessions), P2 (8), P3 (1) |
| Home-visit packages | HV1 (1 visit), HV2 (4) |
| Service areas | `560038` at ₹150, `560095` at ₹200, one waitlist entry for `560025` |
| Admins | Master Admin plus Operations, Finance, Clinical |
| Therapists | A (60% / 65%, rostered), B (55%, rostered), C (50%, on leave) |
| Hospital | `QA Sunrise Hospital` at 10%, one commission earned |
| Patients | A, B, C, D, E, F, plus the declined Z |
| Sessions | At least one delivered video session, one delivered home visit, one cash visit, one refunded, one forfeited |
| Programme | One purchased, six sessions, at least one still unbooked |
| Recommendations | One rejected, one approved with changes, one withdrawn, one purchased |
| Money | A settled payout with cash netted off, three costs, discounts given split by rule |
| Logs | A row for every admin action above, including the reset and the impersonation |

---

### 17.2 Every role, every surface

The run is organised by the work rather than by the role, so this is the
cross-check: each role against the screens that are theirs. If a cell has no
step behind it, the run has a hole.

**Patient** - Part 4 end to end, plus their view in Parts 5-9 and 12.

| Surface | Step |
| --- | --- |
| Register through the booking wizard, and through `/patient/register` | 4.2, 4.8 |
| Held at `/pending-approval` until approved, at the screen **and** the route | 4.8 |
| Overview, and every screen's loading state | 4.5 |
| Book and pay, every payment outcome | 4.4 |
| Edit Profile, addresses, uploaded reports | 4.6, 9.1 |
| Health Profile locked, then unlocked, then exported | 4.7, 6.4, 6.5 |
| Sessions: confirmed, joined, completed, rated | 5.2-5.8 |
| Suggested Sessions: an offer, and a proposed time | 7.7, 8.4 |
| Paying for a programme and scheduling the run | 7.7, 7.8 |
| Home visit, online and cash | 9.1, 9.4 |
| Payments screen, refunds in their own voice | 9.8 |
| Discounts they can trigger themselves | 12.1, 12.3, 12.4, 12.6 |
| Cannot reach another patient, or any other role's screens | 6.6, 13.8 |

**Therapist** - Part 8 end to end, plus their view in Parts 5-7 and 9.

| Surface | Step |
| --- | --- |
| Apply, wait, be approved, sign in | 3.1-3.4 |
| Held at the door at the route, not only the screen | 3.2 |
| Overview: four figures, each agreeing with what it opens | 8.1 |
| Edit Profile: instant vs. reviewed, withdraw, decline | 8.2 |
| Availability: weekly, exceptions, leave | 3.6 |
| My Patients, and the Programmes toggle | 8.3 |
| Triage, health record, Pain Map | 6.1-6.3 |
| Deliver, complete, write the note | 5.5, 5.6 |
| Recommend a programme | 7.1 |
| Suggest the next session | 8.4 |
| Record cash at the door | 9.5 |
| Earnings and requesting a payout | 8.5 |
| Masked contact, and one logged reveal | 5.7 |
| Cannot reach an unassigned patient, another role, or an admin route | 8.3, 8.6 |

**Partner hospital** - Part 10 end to end.

| Surface | Step |
| --- | --- |
| Public enquiry, then provisioned by an admin | 3.10 |
| Their own five screens | 3.11 |
| Refer, online and home visit | 10.1, 10.2 |
| Watch the status pipeline | 10.3 |
| Withdraw, and be refused once the link has gone | 10.4 |
| Earnings, and a refund reversing the commission | 10.6 |
| Cannot see another partner, a clinical record, or the back office | 10.8 |
| Suspended, and locked out at the route | 10.9 |

**Master Admin** - Part 14 screen by screen, plus every part's admin blocks.

| Surface | Step |
| --- | --- |
| Reset the database, and its four gates | 1.2, 3.9 |
| Build the whole catalogue | 2.1-2.8 |
| Approve, decline, suspend, delete | 3.4, 4.9, 13.7 |
| Assign, reschedule, reopen | 5.2, 5.9 |
| Review recommendations, all three outcomes | 7.4, 7.5 |
| Write one on a therapist's behalf, and withdraw one | 7.11, 7.12 |
| The whole of Money, and the two identities | 11.1-11.10 |
| Every one of the seven sections, screen by screen | 14.1-14.8 |
| Sign in as somebody else | 13.5 |
| Read and clear the log | 13.6 |

**Operations, Finance, Clinical** - Part 13.

| Surface | Step |
| --- | --- |
| Each lands on its own Today screen | 13.1 |
| Every admin route refuses them | 13.2 |
| Finance reads Sessions and cannot change one | 13.2, 13.3, 5.5 |
| Their own desk's activity feed | 14.1 |
| Their own desk's risk signals; the trails stay closed | 14.1 |
| Logs refuses all three, at the screen and both routes | 13.6 |
| Exports follow the scope, not only the screen | 11.5 |
| The reset refuses them | 3.9 |

**Nobody at all** - signed out.

| Surface | Step |
| --- | --- |
| The eight public pages | 4.1, 15.1 |
| The splash, and where it must not appear | 4.1, 15.10 |
| A quote before an account exists | 12.1 |
| Every mutating route refuses them | 13.8 |
| Malformed bodies answer 4xx, never 500 | 13.8 |
| A public door is rate limited, and says so without blame | 13.9 |
| The back office is never named to them | 13.10 |

---

### 17.3 The sign-off sheet

| | |
| --- | --- |
| Build / commit tested | |
| Environment (URL and Supabase project) | |
| Tester | |
| Started | |
| Finished | |
| Steps passed | |
| Steps failed | |
| Steps blocked | |
| Steps N/A (and why) | |
| **P0 defects raised** | |
| **P1 defects raised** | |
| P2 / P3 defects raised | |
| Safe to release? | Yes / No / Yes with the listed exceptions |
| Signature | |

**The rule for that last row.** Any open **P0** is a No. A P0 is money, clinical data or access control being wrong: somebody charged a figure they were not quoted, one patient's record reachable by another, a route answering 200 to a caller it should refuse.

---

### 17.4 The twelve checks that matter most

If you have time for nothing else, these are the ones whose failure is worst. Each names the step that covers it.

| # | Check | Step |
| --- | --- | --- |
| 1 | The payment screen charges exactly the figure it quoted | 4.2, 4.4, 9.1, 12.1 |
| 2 | A free total takes no money at all, and never ₹1 | 12.6 |
| 3 | A programme cannot be bought without a recommendation | 7.2, 9.3 |
| 4 | A recommendation the clinic has not approved reaches the patient in no form | 7.1, 7.2 |
| 5 | One patient's clinical record is unreachable by another patient, and by an unassigned clinician | 6.6 |
| 6 | Every admin route refuses the three limited desks | 13.2 |
| 7 | Every mutating route refuses an anonymous caller | 13.8 |
| 8 | A purchase is never rewritten by a later catalogue edit | 7.10 |
| 11 | An authorization is not a capture - nothing is fulfilled against a hold | 11.11 |
| 12 | A therapist's suggestion spends nothing until the patient accepts it | 8.4 |
| 9 | Travel is paid to the therapist in full and never counted as revenue | 9.6, 11.2 |
| 10 | Suspending an account locks it out at the route, not only on the screen | 10.9, 13.7 |

---

### 17.5 What this run deliberately does not cover

Say so explicitly rather than letting silence imply coverage.

* **Real money.** Everything here is Razorpay test mode. Nothing proves a live key works.
* **Email and SMS delivery.** Addresses end `.test` and cannot receive anything. Password-reset and invite emails are checked as far as "the request succeeded", never as "it arrived".
* **Google Calendar and Meet, where the account is not connected.** If System Health says *Not set up*, every Meet check is N/A rather than failed.
* **Load and performance.** One tester on one browser says nothing about fifty patients booking at once.
* **Browsers other than the one you used.** Note which you used on the sheet.
* **The database's own guards.** Several rules are enforced by the database as well as by a route - the credit ledger's append-only trigger, the retention floor, the reorder function's completeness check. Proving those needs SQL against a scratch database, which is a developer's job and lives in the repository's own checks.
* **Anything a second run would need reset.** See below.

---

### 17.6 Running it a second time

This document builds its own data, which makes it repeatable - but only from the same starting point.

**The clean way.** Go back to **Step 1.2** and reset. Everything from Part 2 onward rebuilds itself, and that is the point of the ordering.

**What you lose by not resetting.** Running Part 4 again against a database that already has Patient A gives you *"user already registered"* at Step 4.2, which is correct behaviour and reads as a broken signup. The same is true of every unique fixture: the hospital's email, the promo code, the conditions' names.

**What to write down before you reset**, because the wipe takes it:

* The three scoped admins' generated passwords - they are shown once and stored nowhere you can reach.
* The hospital's generated password and referral code.
* Any defect you have raised but not yet written up, with its screenshots.

**What the reset keeps**: admin logins, and your conditions with their programmes. Everything else in Part 2 - home-visit packages, service areas, FAQs, testimonials - you create again.

---

### 17.7 If something in this document is wrong

This run quotes real screen names, real settings, real error strings and real prices. When the application changes, some of them go stale, and a stale expectation reads exactly like a defect.

Two things separate one from the other:

1. **Check the step's own reasoning.** Nearly every expectation here says *why*. If the reason still holds and only the wording has moved, it is the document that is stale. If the reason no longer holds, it is a product change somebody should have documented - raise it either way.
2. **Check which server you are pointed at.** The public pages are cached, so a production build serves markup generated before your fixtures existed. A condition you just created being absent from `/conditions` on a production build is that cache, not a broken catalogue.

Raise a documentation fix the same way you raise a defect, marked **Doc**. It costs a line and saves the next tester an hour.

---
