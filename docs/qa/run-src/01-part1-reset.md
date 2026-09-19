## 2. Part 1 - Start from nothing

**What this part does.** Empties the database, proves the wipe's own guards, and confirms the one account that has to survive it did. Everything after this part builds on an empty database, so nothing here is optional.

**Time.** About 15 minutes.

---

### Step 1.0 - Make sure you can sign in as an admin

The reset keeps admin logins and deletes everyone else, so you need one admin **before** you press it. On a database nobody has used yet there is exactly one, created by hand.

**Do this**

1. Open `http://localhost:3000/admin/login`.
2. Tap **Email Address** and enter your admin's email. If you are creating one now, use:

| Field | Value |
| --- | --- |
| Email | `qa.admin@example.test` |
| Password | `QaTest!2024pass` |
| Full name | `QA Master Admin` |

3. Tap **Password**, enter the password, and tap **Sign In**.

**Expect.** You land on `/admin/dashboard`. The sidebar brand reads **Master Admin** above *Admin Panel*, and the eyebrow above the page heading reads **Master Admin** as well - twice, on purpose, because the sidebar collapses on a phone. You can see all seven sections: **Today, Sessions, People, Money, Catalog, Logs, Settings**.

**If you cannot sign in.** The account has to be made in the Supabase dashboard: **Authentication → Users → Add user** with that email and password and *Auto Confirm User* ticked, then **Table Editor → profiles**, find the row, and set `role` to `admin`, `active` to `true`, `admin_scope` to `full`. There is no screen in the application that creates the first admin, deliberately.

> **A Master Admin is what this run calls a `full` scope admin.** Three narrower desks - Operations, Finance, Clinical - are created at Step 3.7. Until then, every admin instruction means this account.

---

### Step 1.1 - Confirm the debug bar is there

**Do this.** Look at the top of the page.

**Expect.** A black **Debug** bar pinned across the top, listing routes and carrying a **Reset data** button. It is on in every environment on purpose until launch, so seeing it here is correct, not a defect.

**If it is missing**, `NEXT_PUBLIC_SHOW_DEBUG_NAV` is set to exactly `false` in the environment. Nothing else in this run works without it - unset that variable and restart the server.

---

### Step 1.2 - Empty the database

**Do this**

1. In the Debug bar, tap **Reset data**.
2. Read the red warning that appears.
3. Tap the confirmation field - its placeholder reads `RESET ALL DATA` - and type, deliberately wrongly:

```
reset all data
```

4. Look at the **Reset** button without tapping it.
5. Clear the field and type it exactly:

```
RESET ALL DATA
```

6. Tap **Reset** and wait for the button to stop reading **Resetting…**.

**Expect**

* At step 2, the warning names both survivals: *"Deletes people, sessions, purchases, money and settings. Admin logins and your conditions (with their programmes) survive - the rest of the catalog does not. No undo."*
* At step 4, the **Reset** button is **disabled and visibly faded**. A lower-case phrase never arms it.
* At step 6, a teal confirmation appears **with real figures** - *"N accounts deleted, M admins kept"*. **Two zeroes is a P0**: it means the route read a field name the database function does not return, and a wipe that emptied everything is indistinguishable from one that did nothing.
* You are **still signed in**. The reset does not destroy your session.

**Two specific failures worth knowing by name**

| What you see | What it is |
| --- | --- |
| `UPDATE requires a WHERE clause` | A statement inside the reset function is missing its `WHERE`. This can only ever be caught by pressing this button - applying the schema or running the statement in the SQL editor connects as a different database role that does not enforce it. **P0.** |
| `404` in the console, or nothing happens at all | `ALLOW_DEBUG_DATA_RESET` is not set in the **server** environment. The route answers 404 rather than 403 deliberately, so its existence is not confirmed to a stranger. Not a defect. |

---

### Step 1.3 - Check what the reset kept and what it removed

**Do this.** Visit each of these and look.

| Go to | Expect |
| --- | --- |
| **People → Patients** | An empty-state message, not a table. |
| **Sessions → All Sessions** | No sessions. |
| **Catalog → Conditions** | Whatever conditions existed **before** the reset are still here, at their prices and in their order. This is the one part of the catalogue the wipe keeps, because it is the part an admin builds by hand. |
| **Catalog → Service Areas** | Empty. Service areas **are** cleared. |
| **Catalog → Packages**, home-visit section | Empty. Home-visit packages **are** cleared. |
| **Logs → All Activity** | Exactly **one** row - the reset recording itself. The wipe truncates the log and then writes that row, so a completely empty log here means the most destructive action in the product went unattributed. **P1.** |
| **Settings → User Access** | At least one admin, including your own row. |
| **Today → Risk** | An empty queue. |
| `/conditions` (public, signed out) | The conditions still render. The public site must not come back empty - that reads as the clinic having shut rather than as test data being cleared. |

> **If Settings → User Access is empty, stop the run and restore from a backup.** The reset must never leave the clinic with nobody who can open the back office.

**Optional, if you have the Supabase SQL editor open.** Run each and expect `0`:

```sql
select count(*) from communication_flags;
select count(*) from risk_signals;
select count(*) from appointments;
```

And confirm the risk thresholds came back rather than being wiped:

```sql
select rule_key, enabled from risk_rules order by rule_key;
```

Eight rows, with `plan_conversion_low` and `post_consultation_dropout` **disabled** - those two need a clinic baseline nobody has yet, so they ship off.

---

### Step 1.4 - Note the two conditions the reset left you

Because conditions survive, you may already have some. Look at **Catalog → Conditions** and write down what is there.

* **If the list is empty**, you will create all three at Step 2.1 and the run proceeds exactly as written.
* **If rows already exist**, you will still create the three this run needs at Step 2.1. Leave the others alone; they cost nothing, and deleting them is its own test at Step 13.4.

---
