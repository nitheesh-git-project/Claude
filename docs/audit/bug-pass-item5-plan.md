## Plan: remove the Catalog "Packages" tab, move home-visit prices under Conditions, show single sessions only, and send every programme session through the admin

Nothing was edited; this is a plan only. Three things to know first:
- **The Session Packages editor is not used anywhere new.** Recommendations are priced from condition rates (`loadRecommendableRates`). The old `treatment_category_packages` rows are still read in two places: by `resolveRecommendablePackage` for recommendations written before per-session pricing (`care-plan/create-order/route.ts:167`, `carePlanReview.ts:345`), and by the Purchases screen for titles (`page.tsx:3254`, `:3412`). So remove the editor, but keep the rows and the queries.
- **No e2e spec checks the old auto-assign**, so nothing fails today. The manual QA plan does state it (listed in D).
- **Ship as three PRs:** (1) assignment, (2) catalog and home-visit pricing, (3) expiry wording. PR 3 touches `CarePlanOfferCard.tsx`, which the other agent is editing, so it goes last, rebased on their merge.

### A. Where the home-visit price lives

**Recommendation: keep `home_visit_packages` rows with `visit_count = 1`.** One row with `category_id is null` is the clinic-wide price. At most one active row per condition overrides it. Nothing gets a new column.

Why this option:
- Both purchase tables need a `package_id` (`schema.sql:2553`), and `ensureCourseTemplate` already relies on that.
- `create-order`, `book-cash`, `verify`, `fulfilPaidPurchase.readValidityDays` and `readHomeVisitPackageTerms` all keep working unchanged.
- Old purchases and the multi-visit rows are left alone.
- Putting the price on `treatment_categories` or `site_settings` instead would still need hidden package rows for every purchase.

**Migration** (appended to `schema.sql`, re-runnable, one `do $$` block):
1. **Reconcile duplicates.** For each key `coalesce(category_id, nil-uuid)` among active, `visit_count = 1`, non-course rows: keep the cheapest (ties go to the oldest `created_at`, then `id`) and set the others `active = false`. "Cheapest" is exactly what `loadRecommendableRates` charges today.
2. **Create a clinic-wide row if there is none** but single-visit rows exist. Copy the cheapest one's price, duration and `travel_fee_included`; title it "Home visit". Today `loadRecommendableRates:105` falls back to the cheapest row of *any* condition, so this keeps every current recommendation price the same.
3. **Add the index** `home_visit_packages_one_rate_per_category`: unique on `coalesce(category_id, '0000…'::uuid)` where `active and visit_count = 1 and not care_plan_course`.

Rows with more than one visit and course rows stay untouched. Before applying, run a `select` of the rows step 1 would switch off and show it to the owner.

**New module `src/lib/homeVisitRates.ts`** (no dependencies, unit-tested):
- `effectiveHomeVisitRate(rows, categoryId)` returns the condition's own price, else the clinic-wide price, else null.
- A server wrapper `loadHomeVisitRates(admin)` reads the rows.

**Every reader that must change:**
- `carePlanServer.ts:87-139`: use the module and drop the "cheapest of any" fallback. Keep the `RecommendableRate` shape, including `validityDays` (the other agent's checkout reads it).
- `/home-visit` (`app/home-visit/page.tsx`) and `HomeVisitPackages.tsx`: list active conditions as cards priced at their effective rate, using the condition's photo and featured flag. Each links to `/book-home-visit?category=<id>`.
- `/book-home-visit` and `HomeVisitBookingWizard.tsx`: the picker lists conditions, built by a new `homeVisitConditionOption()` in `serviceOptions.ts` that replaces `homeVisitServiceOption`.
  - It defaults through `defaultCategoryId` (General Consultation).
  - An old `?package=` link maps to that row's condition, or to the clinic-wide price. A multi-visit link still gets the existing "this needs a recommendation" answer.
- `api/home-visit/create-order` and `book-cash`: accept `categoryId` and resolve the row on the server. A `packageId` is accepted only if it is a current price row. Pass `categoryId` to `bookHomeVisitSession`, which then sets `appointments.category_id` and `concern`.
- Patient booking hub (`patientDashboardData.ts:330,386` and `PatientBookingHub.tsx:156-209`): the "Home visits" group becomes condition cards.
- `delete-treatment-category`: switch off or delete an unused condition price itself instead of blocking on "home-visit packages" the admin can no longer see.
- Checkout quotes: `checkoutQuote.ts:125` prices a hospital-referral home visit at the *online* condition price. Leave it for now (the promo-code agent may be in that file) and log it as a follow-up.

### B. The Catalog → Conditions screen

- **`adminNav.ts:271`:** delete `{ key: "packages" }` and add a blurb and example to Conditions. Old `?tab=packages` links fall back to Conditions on their own through `findTab`.
- **Remaining tabs:** Conditions, Service Areas, Countries & currency, Purchases. Purchases is untouched and is handed to the planned Programmes section.

**Layout (`page.tsx`):** one page titled **Conditions**, with two sections and in-page anchors:
1. **Online sessions:** the existing `TreatmentCategoryManager`, with copy saying it is one video session each.
2. **Home visits** (new `HomeVisitPriceList.tsx`):
   - A top row: "Clinic-wide price" in ₹, plus visit length, with Save.
   - Then one row per active condition showing either "Clinic-wide (₹X)" in muted text with **Set own price**, or "₹Y own price" with **Edit** and **Use clinic-wide**.
   - A footer: "Travel is added per visit from Service Areas. Hands-on recommendations use these prices."
   - If home visits are switched off, show a banner linking to Settings → Programmes & Home Visits.
   - Fields hidden or auto-set: title (auto), subtitle, description, image, benefits, badge, highlight, terms, compare-at, validity, visit count (always 1), lock (true), gap and weekly cap, purchase cap, order, visibility flags, `recommendable`, `featured`.
   - It saves through a new route `/api/admin/set-home-visit-price` (`requireAdminScope("catalog")`, `parseJsonBody`, logs `catalog.update`, `revalidatePath("/home-visit")`). A duplicate (error 23505) is answered with a 409 and a sentence.

**Remove:**
- `catalogPackagesTab` (`page.tsx:3290-3328`) and the `"catalog:packages"` entry (`:5428`).
- The "Programmes" cell in the catalog stat strip (`:3506-3512`); replace it with a "Home visit price" cell.
- The components `PackageCatalogManager/Form` and `HomeVisitPackageManager/Form`.
- The routes `create/update/delete-package` and `create/update/delete-home-visit-package`.
- `validatePackagePayload(.test).ts` and `validateHomeVisitPackagePayload.ts`.
- Narrow the `home_visit_packages` and `treatment_category_packages` selects to what Purchases needs.

**Stale copy to fix:** `AdminCarePlansTab.tsx:732-733` ("Catalog → Packages" becomes "Catalog → Conditions"), `PackageSettingsForm` lock-switch text, `README.md:2024`, and `docs/rules/frontend.md:499,517`.

### C. Remove counts and day wording; show expiry only near the end

**Single-session catalog items:**
- `serviceOptions.ts:236-262`
- `HomeVisitPackages.tsx:96-134, 183, 205-208`
- `PatientBookingHub.tsx:166-198`
- `HomeVisitBookingWizard.tsx:1074, 1103-1104`

**Programmes (PR 3):**
- `CarePlanOfferCard.tsx:376` (the "Valid N days" tag) and `:659` ("Use them within"). This is the other agent's file.
- `therapist/CarePlanFields.tsx:329`.
- `PatientPackageWidget.tsx:110-120` and `HomeVisitPackageWidget.tsx:109-120`: drop the plain "N days left". The amber line becomes "3 sessions left, book by 12 Nov".
- `PackageDetailModal.tsx:224-227` and `HomeVisitDetailModal.tsx:219-222`: show the expiry only when the programme is expiring soon.

Add `patientExpiryNotice(expiresAt, pending, nowMs, reminderDays)` to `packageProgress.ts`. It returns null unless `computePackageExpiryState` says `expiring_soon` and sessions are still pending. Optionally add a `needsYou` item in `dashboardFeed.ts` using it. The Settings fields `package_default_validity_days`, `home_visit_default_validity_days` and `package_expiry_reminder_days` stay; the migration nulls `validity_days` on price rows.

### D. Every programme session goes through the admin

**`bookPackageSession.ts:258-313`:**
- Delete the reserve-and-confirm block and the Meet call.
- Every session is inserted `requested` and unassigned (already true at `:189-208`).
- Remove the `assignTherapistId` parameter (`:91-96`).
- The result's `assignedTherapistId` is always null.

**`bookHomeVisitSession.ts:298-336`:** the same change. Prepaid visits stay `paid`, cash visits stay `unpaid`.

**Routes:**
- `respond-suggestion/route.ts:181-204`: drop the suggester read and `assignTherapistId`.
- `book-cash`: no change; its lock is already null.
- `book-with-package`, `book-package-sessions` and `book-visits`: no change.

**How the queue shows the pre-picked therapist:**
- `needsTherapist` already counts purchase-drawn sessions.
- Add `programmeTherapistFor(row, locks)` to `sessionAssignQueue.ts`. It reads the purchase's `locked_therapist_id` at render time, so a programme reassignment is reflected straight away. The page already loads `package_purchase_summary.locked_therapist_id` and the home-visit purchases.
- Pass a map of appointment to programme therapist into `AdminAllSessionsTab`, `AdminCalendarTab` and `SessionDetailDrawer`.
- On the All Sessions row (`:750-759`), the chip reads "Tap to assign · {name}".
- In the drawer, when a session needs assigning and has a programme therapist, show a primary **Assign {name}** button, with the existing select below for "someone else".
- `AssignTherapistForm` and `HomeVisitAssignForm` get a `programmeTherapistId` prop that pre-selects them, labelled "Programme therapist".
- Today's hint becomes "…programme sessions have their therapist pre-picked".

**Assigning:** `assign-appointment` already confirms paid sessions, creates the Meet link or calendar event (`:299-320`), and sets the lock on first assignment. No change is needed there.

**What the patient sees:** add `patientSessionStatus(a)` to `sessionRowStatus.ts`. A `requested` session drawn from a purchase reads "Booked - confirming your therapist". Use it in:
- `PatientSessionCard.tsx:86-93`
- `SessionFilterList`
- `dashboardFeed.ts:215-223`
- The result rows in `PackageBulkScheduler.tsx:264` and `HomeVisitBulkScheduler.tsx:197`

`sessionSuggestions.ts:57` ("Booked") becomes "Accepted - clinic confirming".

**Rules docs:**
- `programmes.md:66-82`: rewrite. The lock pre-selects the admin's choice and does not auto-assign.
- `roster.md:293-310`: add that an accepted suggestion lands in the queue with the therapist pre-picked.
- `home-visit.md:223-227`: the travel buffer now applies at assign time.
- `admin.md:445-459`: the queue includes programme sessions with a pre-pick.

**Specs:** none fail. Update the QA plan: `07-patient.md:580, 648, 655-` (PAT-PKG-003), `14-ux-states-crossrole.md:332`, and `11-admin-b.md:208, 721` (lock switch).

### E. Tests, specs and docs

**Unit tests:** `homeVisitRates.test.ts`, `programmeTherapistFor`, `patientSessionStatus`, `patientExpiryNotice`, and `serviceOptions.test.ts` updated.

**New e2e spec `programme-sessions-via-admin.spec.ts`:**
- `book-package-sessions`, `respond-suggestion` and `book-visits` each leave the session unassigned and `requested`.
- The row shows the pre-pick.
- One-click Assign makes it `confirmed` with the locked therapist; use `openTherapistHour`.

**Existing e2e:**
- Extend `session-scheduling` SCH-001 to assert the sessions stay unassigned.
- Delete `package-category-picker.spec.ts` and `package-form-flags.spec.ts`.
- Rework `catalog-detail` (home-visit cards and the `?category=` link), `service-picker:344-` and `consultation-first`.
- `global-setup.ts:89-118`: create the clinic-wide price row; the four-visit programme row stays as a legacy fixture.
- Add an e2e for the Conditions → Home visits list: set an own price, use clinic-wide, and see the recommendation price follow.
- Update `e2e/README.md`.

**Docs:** `public-site.md` (home-visit cards), `booking.md:106,133`, `data-schema.md` (new index), `admin.md`, README "Home Visit" and Catalog sections, and `docs/qa/src/04-test-data.md:189,222`, `10-admin-a.md:384`, `11-admin-b.md:523,715-718`.

### F. Risks and open questions for the owner

1. **Step 1 of the migration switches off home-visit rows the public page currently sells** (extra clinic-wide cards). The owner should see the list first.
2. **Existing price rows with `travel_fee_included = true`.** Should they keep including travel, or switch to the Service Areas fee? Switching changes what patients are charged. Proposal: keep the value, but don't offer it on new rows.
3. **A gap between booking and assigning.** The locked therapist's hour is no longer held, so it can be taken before the admin assigns. Assigning is also strict about the roster: a therapist who suggests a time outside their hours will hit a 409 when the admin assigns. Option: have `suggest-session` check `checkTherapistAssignable` up front.
4. **Old cash visits still won't confirm on assign.** For a cash visit, `assign-appointment` leaves it `requested` with no calendar invite (`shouldConfirm` needs paid or pay-later). This is unchanged, but the assign-only flow makes it more visible.
5. **The "Therapist lock" switch** now only controls the pre-pick. Keep it, or retire it?
6. **Should a first video consultation keep auto-assigning from the roster** (`autoAssignTherapist`)? The owner's request named programme sessions only.
7. **Conflict risk with the other agent** in `CarePlanOfferCard.tsx`, `care-plan/create-order` and `carePlanServer.ts`. Keep our `carePlanServer` change internal and the `RecommendableRate` shape stable.
8. **Referral home visits** are priced at the online condition price (`checkoutQuote.ts:125`); flag it to the owner as a follow-up.

### Critical Files for Implementation
- /home/user/Claude/src/lib/bookPackageSession.ts
- /home/user/Claude/src/lib/bookHomeVisitSession.ts
- /home/user/Claude/src/lib/carePlanServer.ts
- /home/user/Claude/src/app/admin/dashboard/page.tsx
- /home/user/Claude/src/components/HomeVisitBookingWizard.tsx
