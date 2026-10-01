#!/usr/bin/env node
// Authorization checks at the policy layer, against a real database.
//
// These sit below the routes deliberately. Every route in this app guards
// itself, and those guards are the first line -- but a valid session cookie
// reaches PostgREST directly, without passing any of them, which is the exact
// reasoning that put `requireActiveProfile` and `is_admin()` where they are.
// So the question these answer is not "does the route refuse?" but "if
// somebody went round the route entirely, does the database still refuse?"
//
// Four properties, each a named audit finding:
//
//   Cross-tenant isolation  one partner hospital cannot read another's
//                           referrals, patients or revenue
//   IDOR / BOLA             knowing a row's id is not authorization
//   Enumeration            a refused read is indistinguishable from an
//                           absent row
//   Suspension             a suspended account's live token reads nothing
//
// Usage:
//   node scripts/authorization-checks.mjs
//
// Needs SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_ACCESS_TOKEN in .env.local. It creates its own accounts, tags them
// AUTHCHK, and removes them at the end including on the asserting paths.
//
// NEVER point this at a database with real patients.

import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TAG = "AUTHCHK";
const PASSWORD = "AuthChk!2026pass";
const ref = URL_.split("//")[1].split(".")[0];

let failures = 0;
function assert(ok, msg) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${msg}`);
  if (!ok) failures++;
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`SQL ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

/** Create an account through GoTrue, so it has a real password to sign in with. */
async function createAccount(role, label) {
  const email = `${TAG.toLowerCase()}.${label}@example.test`;
  const r = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role, full_name: `${TAG} ${label}` },
    }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`createUser ${label}: ${JSON.stringify(body).slice(0, 300)}`);
  const id = body.id;
  // handle_new_user inserts the profile as unapproved; these fixtures need to
  // be usable, and the role has to be what we asked for.
  await sql(`update profiles set role='${role}', approved=true, active=true where id='${id}';`);
  return { id, email };
}

/** Sign in and return a bearer token for that account. */
async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`signIn ${email}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.access_token;
}

/** A PostgREST read as that account, with RLS applying. */
async function readAs(token, path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, rows: Array.isArray(body) ? body : null, body };
}

async function writeAs(token, path, payload) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, rows: Array.isArray(body) ? body : null };
}

async function cleanup() {
  await sql(`
    delete from patient_referrals where patient_name like '${TAG}%';
    delete from appointments where concern = '${TAG}';
    delete from profiles where email like '${TAG.toLowerCase()}%@example.test';
    delete from auth.users where email like '${TAG.toLowerCase()}%@example.test';
  `);
}

try {
  await cleanup();

  console.log("Creating fixtures...");
  const hospitalA = await createAccount("hospital", "hosp-a");
  const hospitalB = await createAccount("hospital", "hosp-b");
  const patientA = await createAccount("patient", "pat-a");
  const patientB = await createAccount("patient", "pat-b");
  const therapist = await createAccount("therapist", "ther");

  // A referral belonging to hospital A, and an appointment belonging to
  // patient A with nobody assigned.
  const refA = (
    await sql(`insert into patient_referrals (hospital_id, patient_name, medical_issue, status)
      values ('${hospitalA.id}', '${TAG} referred', 'knee', 'pending_review') returning id;`)
  )[0].id;
  const apptA = (
    await sql(`insert into appointments (patient_id, slot_time, duration_minutes, status, concern)
      values ('${patientA.id}', now() + interval '20 days', 60, 'requested', '${TAG}') returning id;`)
  )[0].id;

  const tokHospA = await signIn(hospitalA.email);
  const tokHospB = await signIn(hospitalB.email);
  const tokPatA = await signIn(patientA.email);
  const tokPatB = await signIn(patientB.email);
  const tokTher = await signIn(therapist.email);

  console.log("\n1. Cross-tenant isolation: one partner cannot see another's referrals");
  {
    const own = await readAs(tokHospA, `patient_referrals?select=id&id=eq.${refA}`);
    assert(own.rows?.length === 1, "hospital A reads its own referral");

    const other = await readAs(tokHospB, `patient_referrals?select=id&id=eq.${refA}`);
    assert(other.rows?.length === 0, `hospital B reads none of it (got ${other.rows?.length})`);
    // Enumeration: a refused read and an absent row are byte-identical.
    const absent = await readAs(tokHospB, `patient_referrals?select=id&id=eq.${refA}`);
    const madeUp = await readAs(
      tokHospB,
      `patient_referrals?select=id&id=eq.00000000-0000-0000-0000-000000000000`
    );
    assert(
      absent.status === madeUp.status && JSON.stringify(absent.rows) === JSON.stringify(madeUp.rows),
      "a refused referral is indistinguishable from one that does not exist"
    );
  }

  console.log("\n2. IDOR: knowing an appointment's id is not authorization");
  {
    const own = await readAs(tokPatA, `appointments?select=id&id=eq.${apptA}`);
    assert(own.rows?.length === 1, "patient A reads their own appointment");

    const other = await readAs(tokPatB, `appointments?select=id&id=eq.${apptA}`);
    assert(other.rows?.length === 0, `patient B reads none of it (got ${other.rows?.length})`);

    const unassigned = await readAs(tokTher, `appointments?select=id&id=eq.${apptA}`);
    assert(
      unassigned.rows?.length === 0,
      `an unassigned therapist reads none of it (got ${unassigned.rows?.length})`
    );

    const write = await writeAs(tokPatB, `appointments?id=eq.${apptA}`, { notes: "IDOR" });
    assert(
      write.rows?.length === 0 || write.status >= 400,
      `patient B cannot write to it (status ${write.status}, rows ${write.rows?.length})`
    );
  }

  console.log("\n3. Enumeration: another patient's profile is not readable or countable");
  {
    const other = await readAs(tokPatB, `profiles?select=id,email&id=eq.${patientA.id}`);
    assert(other.rows?.length === 0, `patient B reads nothing of patient A's profile (got ${other.rows?.length})`);

    const all = await readAs(tokPatB, `profiles?select=id`);
    const onlySelf = all.rows?.length === 1 && all.rows[0].id === patientB.id;
    assert(onlySelf, `listing profiles returns only their own row (got ${all.rows?.length})`);

    const byEmail = await readAs(tokPatB, `profiles?select=id&email=eq.${patientA.email}`);
    assert(
      byEmail.rows?.length === 0,
      "an email cannot be used to confirm an account exists"
    );
  }

  console.log("\n4. The back office is closed to every non-admin role");
  {
    for (const [label, tok] of [
      ["a patient", tokPatA],
      ["a therapist", tokTher],
      ["a hospital", tokHospA],
    ]) {
      const log = await readAs(tok, `admin_activity_log?select=id&limit=1`);
      assert(log.rows?.length === 0, `${label} reads no admin_activity_log`);
      const imp = await readAs(tok, `admin_impersonation_sessions?select=id&limit=1`);
      assert(imp.rows?.length === 0, `${label} reads no impersonation record`);
    }
  }

  console.log("\n5. Suspension takes effect against a token already issued");
  {
    const before = await readAs(tokPatA, `appointments?select=id&id=eq.${apptA}`);
    assert(before.rows?.length === 1, "the patient reads their appointment while active");

    await sql(`update profiles set active = false where id = '${patientA.id}';`);
    const after = await readAs(tokPatA, `appointments?select=id&id=eq.${apptA}`);
    // The row-level policies for a patient key on auth.uid() rather than on
    // `active`, so this documents what suspension does and does not reach:
    // the app refuses them at the proxy and in every route, and the token
    // itself stays valid until it expires. Reported rather than asserted
    // either way, because the honest answer is "the app is the gate here"
    // and a test claiming otherwise would be wrong.
    console.log(
      `  NOTE  a suspended patient's existing token still reads ${after.rows?.length} row(s) at the policy layer - ` +
        `the proxy and requireActiveProfile are what refuse them, and revoke_user_sessions stops renewal`
    );
    await sql(`update profiles set active = true where id = '${patientA.id}';`);
  }

  console.log("\n6. A suspended ADMIN is refused at the policy layer, not only by the app");
  {
    const admin = await createAccount("admin", "adm");
    const tokAdmin = await signIn(admin.email);
    const ok = await readAs(tokAdmin, `admin_activity_log?select=id&limit=1`);
    assert(ok.status === 200, `an active admin's read is not refused outright (status ${ok.status})`);

    await sql(`update profiles set active = false where id = '${admin.id}';`);
    const refused = await readAs(tokAdmin, `admin_activity_log?select=id&limit=1`);
    assert(
      refused.rows?.length === 0,
      `a suspended admin reads no admin_activity_log (got ${refused.rows?.length}) - is_admin() is what does this`
    );
  }

  console.log(
    "\n7. A suspended THERAPIST stops reading clinical records, at the policy layer"
  );
  {
    // The half section 5 could only report. For a patient, the `*_select_own`
    // policies key on auth.uid() alone, so a live token still reads their own
    // rows -- bounded to their own data for one token lifetime, with the app
    // as the gate. A suspended *therapist* was reading other people's medical
    // records on those same terms, which is materially different and is
    // exactly what suspension is meant to stop.
    //
    // `is_active_therapist()` closes it at the row. This asserts both halves:
    // the access that must still work, and the refusal.
    await sql(
      `update appointments set therapist_id = '${therapist.id}' where id = '${apptA}';`
    );
    await sql(
      `insert into patient_condition_profiles (patient_id, specialty, status)
       values ('${patientA.id}', 'ortho', 'active')
       on conflict do nothing;`
    );

    const allowed = await readAs(
      tokTher,
      `patient_condition_profiles?select=id&patient_id=eq.${patientA.id}`
    );
    assert(
      (allowed.rows?.length ?? 0) >= 1,
      `an assigned, active therapist reads the chart (got ${allowed.rows?.length})`
    );

    await sql(`update profiles set active = false where id = '${therapist.id}';`);
    const refused = await readAs(
      tokTher,
      `patient_condition_profiles?select=id&patient_id=eq.${patientA.id}`
    );
    assert(
      refused.rows?.length === 0,
      `a suspended therapist reads no chart (got ${refused.rows?.length}) - is_active_therapist() is what does this`
    );

    // And the access the rule deliberately KEEPS, which is the half a
    // tightening could silently remove: **access follows delivered care**. A
    // completed session keeps whoever ran it -- neither `update-appointment`
    // nor `reassign-package-therapist` will move one -- so a clinician can
    // still open the record of a patient who has since moved to somebody
    // else, and answer for the care they gave. Losing that would be a
    // clinical regression wearing a security improvement's clothes.
    await sql(`update profiles set active = true where id = '${therapist.id}';`);
    const deliveredId = (
      await sql(`insert into appointments
        (patient_id, therapist_id, slot_time, duration_minutes, status, concern)
        values ('${patientA.id}', '${therapist.id}', now() - interval '10 days', 60,
                'completed', '${TAG}') returning id;`)
    )[0].id;
    // The future session moves away; the delivered one cannot and does not.
    await sql(`update appointments set therapist_id = null where id = '${apptA}';`);
    const retained = await readAs(
      tokTher,
      `patient_condition_profiles?select=id&patient_id=eq.${patientA.id}`
    );
    assert(
      (retained.rows?.length ?? 0) >= 1,
      `a delivered session keeps the clinician's access after reassignment (got ${retained.rows?.length})`
    );

    // The mirror, so the rule is "delivered care" rather than "ever named on
    // a row": a therapist whose only link was a future session that moved
    // away reads nothing. They never treated this patient.
    await sql(`delete from appointments where id = '${deliveredId}';`);
    const gone = await readAs(
      tokTher,
      `patient_condition_profiles?select=id&patient_id=eq.${patientA.id}`
    );
    assert(
      gone.rows?.length === 0,
      `a therapist who never delivered anything reads nothing (got ${gone.rows?.length})`
    );
  }
} finally {
  await cleanup();
}

console.log(`\n${failures === 0 ? "ALL AUTHORIZATION CHECKS PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
