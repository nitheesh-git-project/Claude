## 15. Sign-off

### 15.1 What the run should have left behind

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

### 15.2 The sign-off sheet

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

### 15.3 The ten checks that matter most

If you have time for nothing else, these are the ones whose failure is worst. Each names the step that covers it.

| # | Check | Step |
| --- | --- | --- |
| 1 | The payment screen charges exactly the figure it quoted | 4.2, 4.4, 8.1, 11.1 |
| 2 | A free total takes no money at all, and never ₹1 | 11.6 |
| 3 | A programme cannot be bought without a recommendation | 7.2, 8.3 |
| 4 | A recommendation the clinic has not approved reaches the patient in no form | 7.1, 7.2 |
| 5 | One patient's clinical record is unreachable by another patient, and by an unassigned clinician | 6.6 |
| 6 | Every admin route refuses the three limited desks | 12.2 |
| 7 | Every mutating route refuses an anonymous caller | 12.8 |
| 8 | A purchase is never rewritten by a later catalogue edit | 7.10 |
| 9 | Travel is paid to the therapist in full and never counted as revenue | 8.6, 10.2 |
| 10 | Suspending an account locks it out at the route, not only on the screen | 9.9, 12.7 |

---

### 15.4 What this run deliberately does not cover

Say so explicitly rather than letting silence imply coverage.

* **Real money.** Everything here is Razorpay test mode. Nothing proves a live key works.
* **Email and SMS delivery.** Addresses end `.test` and cannot receive anything. Password-reset and invite emails are checked as far as "the request succeeded", never as "it arrived".
* **Google Calendar and Meet, where the account is not connected.** If System Health says *Not set up*, every Meet check is N/A rather than failed.
* **Load and performance.** One tester on one browser says nothing about fifty patients booking at once.
* **Browsers other than the one you used.** Note which you used on the sheet.
* **The database's own guards.** Several rules are enforced by the database as well as by a route - the credit ledger's append-only trigger, the retention floor, the reorder function's completeness check. Proving those needs SQL against a scratch database, which is a developer's job and lives in the repository's own checks.
* **Anything a second run would need reset.** See below.

---

### 15.5 Running it a second time

This document builds its own data, which makes it repeatable - but only from the same starting point.

**The clean way.** Go back to **Step 1.2** and reset. Everything from Part 2 onward rebuilds itself, and that is the point of the ordering.

**What you lose by not resetting.** Running Part 4 again against a database that already has Patient A gives you *"user already registered"* at Step 4.2, which is correct behaviour and reads as a broken signup. The same is true of every unique fixture: the hospital's email, the promo code, the conditions' names.

**What to write down before you reset**, because the wipe takes it:

* The three scoped admins' generated passwords - they are shown once and stored nowhere you can reach.
* The hospital's generated password and referral code.
* Any defect you have raised but not yet written up, with its screenshots.

**What the reset keeps**: admin logins, and your conditions with their programmes. Everything else in Part 2 - home-visit packages, service areas, FAQs, testimonials - you create again.

---

### 15.6 If something in this document is wrong

This run quotes real screen names, real settings, real error strings and real prices. When the application changes, some of them go stale, and a stale expectation reads exactly like a defect.

Two things separate one from the other:

1. **Check the step's own reasoning.** Nearly every expectation here says *why*. If the reason still holds and only the wording has moved, it is the document that is stale. If the reason no longer holds, it is a product change somebody should have documented - raise it either way.
2. **Check which server you are pointed at.** The public pages are cached, so a production build serves markup generated before your fixtures existed. A condition you just created being absent from `/conditions` on a production build is that cache, not a broken catalogue.

Raise a documentation fix the same way you raise a defect, marked **Doc**. It costs a line and saves the next tester an hour.

---
