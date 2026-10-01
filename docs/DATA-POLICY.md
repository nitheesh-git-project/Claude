# Data policy

Migrations, recovery, retention and deletion. Written because four audit
findings were the same finding: these are real operational decisions and none
of them was written down, so the answer depended on who you asked.

---

## 1. Schema changes

### How it works today

`supabase/schema.sql` is one re-runnable file, guarded with
`if not exists` / `or replace`, with later sections adding to earlier tables.
Changes go at the **end** in that same style; earlier statements are not
rewritten. It reaches a live database two ways:

- `node scripts/run-schema.mjs` — by hand, over the Supabase Management API.
- `.github/workflows/schema-apply.yml` — automatically on every push to
  **`main`** that touches the file. It runs in the `Production` GitHub
  environment and reads `SUPABASE_ACCESS_TOKEN` and
  `NEXT_PUBLIC_SUPABASE_URL` from there, not from repository secrets.

**`main` only, and that is a decision rather than an oversight.** `staging`
is the default branch and where everything merges, but those secrets point
at the live project — widening the trigger would apply a staging merge's
schema to the production database. So **staging's database is applied by
hand**, with `run-schema.mjs` or the SQL editor, and that step belongs
*before* the branch is exercised there: the code assumes policies and
functions that are otherwise simply absent, which fails in ways that read as
code bugs rather than as a migration nobody ran.

Automating it for staging means a separate `Staging` GitHub environment
holding staging's own two values, and a second trigger on `staging`. Until
that exists, the hand-application is the step that must not be skipped —
`STAGING.md` holds the whole model.

**Verification before merge**: apply it twice against the target and run the
`scripts/*-sql-checks.sql` files. Applying twice is the actual test — the
whole design rests on re-runnability, and two guards are easy to forget and
have both broken a re-run in practice: a policy needs
`drop policy if exists` under *its own* name, and `alter publication ... add
table` needs the `duplicate_object` wrapper.

### Why it is not numbered migrations

The audit asked for a versioned migration history, and it is right that this
is the weaker option. Stated honestly:

**What the single file costs.** There is no record of *when* a change was
applied, no way to apply a subset, and nothing that fails if a database has
drifted. Reading the file tells you the intended end state, not how any given
database got there. A 12,600-line file is also read by nobody in full, which
is how a column ends up dropped in one place and still written in another.

**What it buys.** Idempotency is the whole of the deployment story: any
database, any age, one command, and the end state is the same. There is no
migration table to get out of sync, no partially-applied state to recover
from, and a developer can point it at a scratch Postgres and get an exact
copy of production's shape.

**The recommendation.** Move to numbered migrations *when a second
environment exists*. With one production project and one throwaway project,
the single file's weakness costs little and its strength is doing real work.
With staging plus production, "which of these has change 47" becomes a
question somebody has to answer, and the file cannot. That is the trigger to
watch for, not a date.

### If a migration fails part-way

The file is one API call, and Postgres runs it as a single batch — so a
failure part-way leaves earlier statements applied and later ones not. That
is survivable *because* the file is idempotent: fix the failing statement and
re-run. It is not survivable if the fix is "remove the statement", because
then the earlier half stays applied and nothing describes it.

**Forward-fix, never destructive rollback.** There is no `down` migration and
there should not be one for this product: the tables hold money and clinical
records, and a rollback that drops a column drops what was in it.

- **A bad DDL statement** (wrong type, wrong constraint): add a corrective
  statement at the end of the file. Never edit the original — a database that
  already applied it would never see the edit.
- **A constraint that a live database refuses** (`CHECK` violated by existing
  rows): that refusal *is the finding*. Reconcile the rows, then re-run. Do
  not weaken the check to make it apply.
- **A column that should not have shipped**: `drop column if exists` at the
  end, which is re-runnable. Accept that the data in it is gone.
- **Anything touching money or clinical history**: write the corrective
  statement, have somebody else read it, and take a backup first (§2).

---

## 2. Backup and recovery

### What exists

Supabase's own automated backups for the project's plan. Point-in-time
recovery if the plan includes it.

### What has not been done

**A restore has never been tested.** This is an open item and it is stated
as one rather than assumed away. Until a restore has been rehearsed, the
backup is a belief rather than a capability, and the things most likely to be
wrong are exactly the things a restore drill finds:

- RLS policies and grants, which are schema rather than data.
- `security definer` functions and their revokes.
- Storage objects, which live outside Postgres — `patient_medical_documents`
  holds metadata and the bucket holds the files, so a database-only restore
  produces rows pointing at files that may not be there.
- `auth.users`, which is a different schema from `public.profiles` and is
  what `profiles.id` references.
- Sequences behind `patient_code` and `session_code`, which have drifted
  before and broke signup when they did.

### The drill, when it is run

1. Restore the latest backup into a **new** project. Never over the original.
2. Apply `supabase/schema.sql` and confirm it reports no changes needed.
3. Run `node scripts/check-live-grants.mjs` against the restored project.
4. Run every `scripts/*-sql-checks.sql`.
5. Point a local app instance at it and sign in as each of the four roles.
6. Check one patient's health profile renders, and one uploaded report opens
   — that is the Storage half.
7. Reconcile: Settings → System Health should report the same checks as the
   original, and Money → Summary the same figures for a closed month.
8. Write down how long it took. That number is the recovery time objective,
   and it is not known until somebody measures it.

---

## 3. Retention

| Data | Kept | Removed by |
| --- | --- | --- |
| `admin_activity_log` | Indefinitely | Archive & Clear only, never within `MIN_RETENTION_DAYS` (30) |
| `payments`, `payment_webhook_events` | Indefinitely | Nothing. Append-only, never deletable. |
| `session_credit_ledger` | Indefinitely | Nothing. Append-only. |
| `care_plan_versions`, `care_plan_reviews` | Indefinitely | Nothing. Append-only. |
| `communication_flags`, `contact_reveal_log` | Indefinitely | Nothing. Append-only by trigger. |
| `admin_impersonation_sessions` | Indefinitely | Nothing but closing it once. |
| Clinical records (`patient_condition_profiles`, `pain_assessments`, `session_notes`) | Indefinitely | Nothing |
| Uploaded reports | Until the patient deletes one | The patient, or cascade on account deletion |
| Issued credentials (`*_admin_notes.temp_password`) | Not kept | No password is issued any more - accounts get a one-time sign-in link (`src/lib/accessLink.ts`); `schema.sql` clears any plaintext earlier versions stored |
| `rate_limit_counters` | One window | The next call for that bucket |

### The audit log's archival strategy

The audit asked for one. It is:

**The log is not archived automatically, and clearing it is a deliberate act
with four gates.** Archive & Clear is the only path a row has ever left that
table by, it is Master Admin only, it cannot reach the last 30 days at any
setting (checked in the module, in the route, *and* inside
`purge_admin_activity_log()`, because that function is reachable from the SQL
editor where no route check runs), it demands a downloaded copy first — and
the download must actually have been produced, not a checkbox saying it was —
and it records itself, outside its own reach.

**Why not automatic.** An automatic purge is a purge nobody decided to run,
on the one table whose value is that it cannot be quietly changed. The cost
is that the table grows for ever; that cost is acceptable at this clinic's
volume and the screen pages by cursor rather than loading it.

**When that stops being true**: if the table reaches a size where the
dashboard's own 200-row read is slow, the answer is to archive the oldest
year to cold storage *with a recorded checksum*, not to delete it. That is a
change with its own design; do not reach for a cron job.

---

## 4. Account deletion

### The rule

**An account is deleted only when nothing points at it.** This is not a
policy anybody chose — 35 foreign keys into `profiles(id)` carry no
`ON DELETE` behaviour, so Postgres refuses outright for an account that has
booked, paid, been paid, been treated, or acted in the back office. Deleting
one "properly" would mean deleting the money and the clinical record with it.

So `delete-account` is for the typo'd email, the duplicate, the account
created against the wrong person. For everything else the answer is
**suspension**, and the account stays because the admin's id is on every audit
row they ever wrote.

### What blocks it, and how that is known

`account_blocking_references(uuid)` reads `pg_constraint` rather than a
hand-written list — a list drifted to 13 of 35 and the screen offered deletes
the database then refused. It counts both `public.profiles` **and**
`auth.users`, because the delete removes the `auth.users` row, so
`storage.objects.owner` (which every account with an uploaded avatar carries)
refuses a delete the screen reported as clear.

A read that fails is a **503**, never "nothing is in the way" — the one
action with no undo.

### What happens to the records

| Record | On deletion |
| --- | --- |
| Anything with a blocking FK | **The delete is refused.** Suspension is offered instead. |
| Uploaded avatar / reports | Must be removed first; they are counted and named as their own group. |
| `admin_activity_log` rows they wrote | Untouched. The actor id remains, which is why an admin is suspended and not deleted. |
| Cascading references | Removed with the account. These are the ones that do not refuse. |

### What this policy does *not* provide

**There is no "right to erasure" path**, and that is a gap rather than a
decision. A patient asking for their data to be deleted cannot be served by
this route: their appointments, payments and clinical records all block it,
and they are also the records the clinic is obliged to keep. The honest
answer needs three things this product has not got — a defined clinical
retention period, an anonymisation path that keeps the financial row and
removes the person, and a decision about what the audit log keeps. That is a
legal question before it is an engineering one, and it should be scoped with
whoever advises the clinic on record-keeping.

---

## 5. Orphan reconciliation

Rows and files that point at nothing, or that nothing points at.

**What is checked today**, on Settings → System Health:

- Payments attached to no booking (`readUnmatchedPayments`).
- Sessions delivered with nothing backing them.
- Credit balances disagreeing between the cache, the ledger and the legacy
  counter (`verify_entitlement_balances`).
- Written-off sessions disagreeing with the bad debt recorded for them.
- Referred patients whose account names no partner.
- Pay-later money in against money accounted for.

- **Patient files against the records describing them**, both directions
  (`readStorageReconciliation`, Settings -> System Health -> Patient files).
  A **record with no file** is red: it is on the patient's own health profile
  and the view route mints a signed URL for something that is not there, so
  the patient meets the failure. A **file with no record** is amber -- nothing
  is broken for anybody, but a scan report the patient believes they deleted
  is still in a bucket. It **lists and never deletes**, per the rule below,
  and a walk that hits its own cap says so rather than reporting a clean
  bucket it only partly looked at.

  It found two orphaned files on its first run against this project, and the
  cause is worth writing down because it is the ordinary one before launch:
  **the debug reset truncates `patient_medical_documents` and cannot reach
  Storage**, so every reset since uploads shipped has left its files behind.
  That is not a bug in the reset -- a `TRUNCATE` has no way to delete an
  object in a bucket -- it is a consequence the check now states instead of
  leaving to be discovered.

**What is not checked, and would need a sweep:**

- **Fixture residue** from e2e runs, which `npm run clean:e2e` handles by hand
  rather than automatically, deliberately — `--reconcile` releases credits and
  cancels appointments rather than deleting, which is what the ledger's
  append-only trigger asks for.

Both storage cases want a reconciliation that **lists** rather than deletes.
A sweep that removes a file because it could not find a row is one bad query
away from deleting a patient's scan.
