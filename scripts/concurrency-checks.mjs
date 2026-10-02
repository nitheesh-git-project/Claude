#!/usr/bin/env node
// Concurrency checks against a real database.
//
// These assert the one class of property that a single psql session cannot
// test and a unit test cannot reach: what happens when several requests land
// at the same instant. The SQL check files beside this one state as much --
// "one psql session cannot race itself" -- and this is the other half.
//
// It matters most for `claim_therapist_slot`, which replaced six hand-rolled
// check-then-write sequences across every booking path. The whole argument
// for that change is that a read followed by a write cannot stop two callers
// both passing the check, and the only honest way to show the replacement
// holds is to fire twelve of them at once and count the winners.
//
// Usage:
//   node scripts/concurrency-checks.mjs
//
// Needs SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ACCESS_TOKEN in .env.local.
// It creates its own fixtures, tags them CONCCHK, and deletes them at the
// end -- including on the paths that assert, because a failed run that left
// rows behind would put a permanent red row on Settings -> System Health for
// a reason that has nothing to do with the product.
//
// NEVER point this at a database with real patients: it inserts and deletes
// accounts and appointments directly.
//
// ---------------------------------------------------------------------------
// WHAT THESE DO AND DO NOT PROVE -- read this before trusting a green run.
// ---------------------------------------------------------------------------
// They prove the functions behave correctly when called in parallel. They do
// NOT prove the calls genuinely overlapped inside the database, and the
// difference matters.
//
// Measured: the invite-cap block below passes against the version of
// `claim_invite` WITHOUT its row lock, as well as with it. Twelve HTTP
// requests fired from one Node process through PostgREST's pool do not
// reliably interleave two statements that take under a millisecond each, so
// a green run here is not evidence that a missing lock would have been
// caught.
//
// So treat these as a regression guard on the *verdicts* -- exactly one
// winner, the right refusal reason, no double-booked therapist -- and not as
// a proof of serialisation. What argues for the locks is the code: a count
// followed by an insert, or a check followed by a write, cannot be
// serialising, whatever a timing-dependent test happens to show on a quiet
// database.
//
// To actually force overlap you need the statements held open against each
// other -- two psql sessions with explicit BEGINs, or a copy of the function
// with a pg_sleep inside the window. Worth doing if one of these ever starts
// failing intermittently; not worth shipping as a routine check, because a
// test that depends on a sleep to find a bug reports a different thing every
// time it runs.

import { readFileSync } from "node:fs";
for (const line of readFileSync("/home/user/Claude/.env.local","utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.split("//")[1].split(".")[0];
async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const TAG = "CONCCHK";
let failures = 0;
function assert(ok, msg) { console.log(`${ok ? "  PASS" : "  FAIL"}  ${msg}`); if (!ok) failures++; }

// ---------- fixtures, created directly and torn down at the end ----------
// A run that crashed part-way never reached the teardown, and its rows would
// make every later run fail on a duplicate email. Clear this script's own
// tagged rows first.
await sql(`
  delete from appointments where concern = '${TAG}';
  delete from profiles where email like '${TAG.toLowerCase()}%@example.test';
  delete from auth.users where email like '${TAG.toLowerCase()}%@example.test';
`);
const ids = await sql(`
  with u as (
    insert into auth.users (id, email) values
      (gen_random_uuid(), '${TAG.toLowerCase()}.p@example.test'),
      (gen_random_uuid(), '${TAG.toLowerCase()}.p2@example.test'),
      (gen_random_uuid(), '${TAG.toLowerCase()}.t@example.test')
    returning id, email
  )
  select json_agg(json_build_object('id', id, 'email', email)) as rows from u;
`);
const rows = ids[0].rows;
const patient = rows.find(r => r.email.includes(".p@")).id;
// A second patient: the schema refuses one patient two overlapping sessions
// (appointments_patient_no_overlap), so a test of two sessions clashing on one
// THERAPIST needs two patients to book them.
const patient2 = rows.find(r => r.email.includes(".p2@")).id;
const therapist = rows.find(r => r.email.includes(".t@")).id;

await sql(`
  insert into profiles (id, role, full_name, approved, active, email)
    values ('${patient}', 'patient', '${TAG} patient', true, true, '${TAG.toLowerCase()}.p@example.test')
    on conflict (id) do update set role='patient', approved=true, active=true;
  insert into profiles (id, role, full_name, approved, active, email)
    values ('${patient2}', 'patient', '${TAG} patient 2', true, true, '${TAG.toLowerCase()}.p2@example.test')
    on conflict (id) do update set role='patient', approved=true, active=true;
  insert into profiles (id, role, full_name, approved, active, email)
    values ('${therapist}', 'therapist', '${TAG} therapist', true, true, '${TAG.toLowerCase()}.t@example.test')
    on conflict (id) do update set role='therapist', approved=true, active=true;
`);

console.log("\n1. Twelve concurrent claims on one unassigned session");
{
  const appt = (await sql(`
    insert into appointments (patient_id, slot_time, duration_minutes, status, concern)
    values ('${patient}', date_trunc('hour', now()) + interval '40 days', 60, 'requested', '${TAG}')
    returning id;`))[0].id;

  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      rpc("claim_therapist_slot", {
        p_appointment_id: appt,
        p_therapist_id: therapist,
        p_expect_unassigned: true,
        p_buffer_minutes: 0,
        p_confirm: true,
      })
    )
  );
  const ok = results.filter(r => r.body?.ok === true).length;
  const reassigned = results.filter(r => r.body?.reason === "reassigned").length;
  assert(ok === 1, `exactly one claim won (won: ${ok}, refused as reassigned: ${reassigned})`);
  assert(ok + reassigned === 12, `every request got a definite answer (${ok + reassigned}/12)`);

  const after = await sql(`select therapist_id, status from appointments where id='${appt}';`);
  assert(after[0].therapist_id === therapist, "the winner's therapist is on the row");
  assert(after[0].status === "confirmed", "and it confirmed exactly once");
}

console.log("\n2. Two concurrent claims on overlapping slots, same therapist");
{
  const base = `date_trunc('hour', now()) + interval '50 days'`;
  const a = (await sql(`insert into appointments (patient_id, slot_time, duration_minutes, status, concern)
    values ('${patient}', ${base}, 60, 'requested', '${TAG}') returning id;`))[0].id;
  const b = (await sql(`insert into appointments (patient_id, slot_time, duration_minutes, status, concern)
    values ('${patient2}', ${base} + interval '30 minutes', 60, 'requested', '${TAG}') returning id;`))[0].id;

  const [ra, rb] = await Promise.all([
    rpc("claim_therapist_slot", { p_appointment_id: a, p_therapist_id: therapist, p_expect_unassigned: true }),
    rpc("claim_therapist_slot", { p_appointment_id: b, p_therapist_id: therapist, p_expect_unassigned: true }),
  ]);
  const wins = [ra, rb].filter(r => r.body?.ok === true).length;
  const clashes = [ra, rb].filter(r => r.body?.reason === "conflict").length;
  assert(wins === 1, `exactly one overlapping claim won (won: ${wins})`);
  assert(clashes === 1, `the other was refused as a clash (clashes: ${clashes})`);

  const both = await sql(`select count(*)::int as n from appointments
    where id in ('${a}','${b}') and therapist_id = '${therapist}';`);
  assert(both[0].n === 1, `only one session ended up on the therapist (got ${both[0].n})`);
}

console.log("\n3. Concurrent claims for the SAME slot on different therapists do not block each other");
{
  // Two statements, like the fixtures at the top: the signup trigger
  // populates profiles from auth.users, so a combined CTE has the trigger's
  // own insert racing the outer one.
  const t2 = (await sql(
    `insert into auth.users (id, email) values (gen_random_uuid(), '${TAG.toLowerCase()}.t2@example.test') returning id;`
  ))[0].id;
  await sql(`
    insert into profiles (id, role, full_name, approved, active, email)
      values ('${t2}', 'therapist', '${TAG} therapist 2', true, true, '${TAG.toLowerCase()}.t2@example.test')
      on conflict (id) do update
        set role='therapist', full_name='${TAG} therapist 2', approved=true, active=true;`);

  const base = `date_trunc('hour', now()) + interval '60 days'`;
  const a = (await sql(`insert into appointments (patient_id, slot_time, duration_minutes, status, concern)
    values ('${patient}', ${base}, 60, 'requested', '${TAG}') returning id;`))[0].id;
  const b = (await sql(`insert into appointments (patient_id, slot_time, duration_minutes, status, concern)
    values ('${patient2}', ${base}, 60, 'requested', '${TAG}') returning id;`))[0].id;

  const [ra, rb] = await Promise.all([
    rpc("claim_therapist_slot", { p_appointment_id: a, p_therapist_id: therapist, p_expect_unassigned: true }),
    rpc("claim_therapist_slot", { p_appointment_id: b, p_therapist_id: t2, p_expect_unassigned: true }),
  ]);
  assert(ra.body?.ok === true && rb.body?.ok === true,
    `both succeeded - the lock is per therapist, not clinic-wide (a: ${ra.body?.ok}, b: ${rb.body?.ok})`);
}

console.log("\n4. The rate limiter's cap holds under twelve parallel hits");
{
  const bucket = `${TAG}:${Date.now()}`;
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      rpc("check_rate_limit", { p_bucket: bucket, p_limit: 5, p_window_seconds: 60 })
    )
  );
  const allowed = results.filter(r => r.body?.allowed === true).length;
  assert(allowed === 5, `exactly 5 of 12 allowed (got ${allowed})`);
}

console.log("\n5. The invite reward cap holds under concurrent claims");
{
  // The cap was a count(*) followed by an insert with nothing between them,
  // so two friends redeeming the same code at once both read the same total
  // and both inserted. A row lock on the inviter closed it.
  await sql(`
    update site_settings set invite_rewards_enabled = true,
      invite_max_rewards_per_patient = 1,
      invite_welcome_paise = 10000, invite_reward_paise = 10000
    where id;`);

  const inviter = (await sql(
    `insert into auth.users (id, email) values (gen_random_uuid(), '${TAG.toLowerCase()}.inv@example.test') returning id;`
  ))[0].id;
  await sql(`
    insert into profiles (id, role, full_name, approved, active, email, invite_code)
      values ('${inviter}', 'patient', '${TAG} inviter', true, true, '${TAG.toLowerCase()}.inv@example.test', 'CONCINV1')
      on conflict (id) do update set role='patient', invite_code='CONCINV1';`);

  // One already-qualified invite, so the inviter is exactly at the cap of 1.
  const friendA = (await sql(
    `insert into auth.users (id, email) values (gen_random_uuid(), '${TAG.toLowerCase()}.fa@example.test') returning id;`
  ))[0].id;
  await sql(`
    insert into profiles (id, role, full_name, approved, active, email)
      values ('${friendA}', 'patient', '${TAG} friend a', true, true, '${TAG.toLowerCase()}.fa@example.test')
      on conflict (id) do update set role='patient';
    insert into patient_invites (inviter_id, invitee_id, code_used, reward_paise, welcome_paise, qualified_at)
      values ('${inviter}', '${friendA}', 'CONCINV1', 10000, 10000, now());`);

  // Two brand-new friends claim at the same instant. Both must be refused.
  const newFriends = [];
  for (const tag of ["fb", "fc"]) {
    const id = (await sql(
      `insert into auth.users (id, email) values (gen_random_uuid(), '${TAG.toLowerCase()}.${tag}@example.test') returning id;`
    ))[0].id;
    await sql(`
      insert into profiles (id, role, full_name, approved, active, email)
        values ('${id}', 'patient', '${TAG} friend ${tag}', true, true, '${TAG.toLowerCase()}.${tag}@example.test')
        on conflict (id) do update set role='patient';`);
    newFriends.push(id);
  }

  const claims = await Promise.all(
    newFriends.map((id) => rpc("claim_invite", { p_code: "CONCINV1", p_invitee_id: id }))
  );
  const accepted = claims.filter((c) => c.body?.ok === true).length;
  const capped = claims.filter((c) => c.body?.reason === "inviter_capped").length;
  assert(accepted === 0, `both claims refused at the cap (accepted: ${accepted}, capped: ${capped})`);

  const total = await sql(
    `select count(*)::int as n from patient_invites where inviter_id = '${inviter}';`
  );
  assert(total[0].n === 1, `the inviter still has exactly 1 invite (got ${total[0].n})`);

  await sql(`
    delete from patient_invites where code_used = 'CONCINV1';
    update site_settings set invite_rewards_enabled = false where id;`);
}

// ---------- teardown ----------
await sql(`
  delete from appointments where concern = '${TAG}';
  delete from profiles where email like '${TAG.toLowerCase()}%@example.test';
  delete from auth.users where email like '${TAG.toLowerCase()}%@example.test';
  delete from rate_limit_counters where bucket like '${TAG}%';
`);

console.log(`\n${failures === 0 ? "ALL CONCURRENCY CHECKS PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
