#!/usr/bin/env node
// Creates (or repairs) every account the manual E2E test plan names, so a
// tester can sign in as any of them straight after a data reset.
//
// Why this exists: `debug_reset_all_data()` deletes every non-admin account
// -- that is the point of it -- and the plan's §8 fixtures are then a list of
// twelve logins that do not exist. Recreating them by hand is twenty minutes
// of form-filling before any testing starts, and the two accounts an admin
// mints from the back office (a scoped admin, a hospital) hand out a
// generated password shown once, so one missed copy is another reset.
//
// It is idempotent and safe to run repeatedly: an account that already exists
// keeps its id, its history and its referral code, and has its password put
// back to the fixture value. That last part is deliberate -- "it says invalid
// credentials" is nearly always a password nobody wrote down rather than a
// missing row, and re-running this fixes both without a second thought.
//
// Setup:
//   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
//   (the service role key, not the anon key -- creating users needs it).
//
// Usage:
//   node scripts/seed-qa-accounts.mjs           # create/repair everything
//   node scripts/seed-qa-accounts.mjs --dry-run # say what it would do
//
// NEVER point this at a database with real patients in it. It writes to
// auth.users and profiles with the service role, which bypasses RLS.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(rootDir, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // .env.local may not exist -- rely on real env vars instead.
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Put both in .env.local (the service role key, not the anon key) and try again."
  );
  process.exit(1);
}

// The one password every fixture account uses -- test plan §8.1. It is in a
// published document on purpose: these accounts exist only on a throwaway
// project, and a tester who cannot sign in is the problem this file solves.
const PASSWORD = "QaTest!2024pass";

// Test plan §8.2, §8.3, §8.8, §8.9, in the order the execution order needs
// them. `profile` is merged into the profiles row the handle_new_user trigger
// has already inserted; every column named here exists in schema.sql.
const ACCOUNTS = [
  // -- §8.2 Admins ---------------------------------------------------------
  // The full admin is the one account the reset keeps, so it is normally
  // already here; seeding it anyway means a project that has never had one
  // gets the account the whole plan starts from.
  {
    label: "Admin Full (Master Admin)",
    email: "qa.admin@example.test",
    fullName: "QA Master Admin",
    profile: { role: "admin", admin_scope: "full", approved: true, active: true },
  },
  {
    label: "Admin Ops",
    email: "qa.admin.ops@example.test",
    fullName: "QA Operations Admin",
    profile: { role: "admin", admin_scope: "operations", approved: true, active: true },
  },
  {
    label: "Admin Finance",
    email: "qa.admin.finance@example.test",
    fullName: "QA Finance Admin",
    profile: { role: "admin", admin_scope: "finance", approved: true, active: true },
  },
  {
    label: "Admin Clinical",
    email: "qa.admin.clinical@example.test",
    fullName: "QA Clinical Admin",
    profile: { role: "admin", admin_scope: "clinical", approved: true, active: true },
  },

  // -- §8.3 Patients -------------------------------------------------------
  // Seeded approved, because the plan's later phases assume a patient who can
  // reach their dashboard. PAT-AUTH-003 needs an *unapproved* one and says so:
  // register a fresh account through the UI for that, or flip `approved` off
  // on Patient B for the duration of the test.
  {
    label: "Patient A (main journey)",
    email: "qa.patient.a@example.test",
    fullName: "QA Patient A",
    profile: {
      role: "patient",
      approved: true,
      active: true,
      phone: "+919876543210",
      date_of_birth: "1990-04-12",
      gender: "Female",
      emergency_contact_name: "QA Contact A",
      emergency_contact_phone: "+919876543299",
      preferred_language: "English",
    },
  },
  {
    label: "Patient B (isolation / negative)",
    email: "qa.patient.b@example.test",
    fullName: "QA Patient B",
    profile: {
      role: "patient",
      approved: true,
      active: true,
      phone: "+919876543211",
      date_of_birth: "1985-11-30",
      gender: "Male",
      preferred_language: "English",
    },
  },
  {
    label: "Patient C (hospital-referred)",
    email: "qa.patient.c@example.test",
    fullName: "QA Referred Patient C",
    profile: {
      role: "patient",
      approved: true,
      active: true,
      phone: "+919876543212",
      date_of_birth: "1978-02-05",
      gender: "Female",
      emergency_contact_name: "QA Contact C",
      emergency_contact_phone: "+919876543298",
      preferred_language: "English",
    },
    // referred_by_hospital_id is deliberately NOT set: the attribution is
    // what HOS-REF-* exercises, and pre-wiring it would make those tests
    // pass on data this script wrote rather than on the referral flow.
  },

  // -- §8.8 Therapists -----------------------------------------------------
  {
    label: "Therapist A (main)",
    email: "qa.therapist.a@example.test",
    fullName: "QA Therapist A",
    profile: {
      role: "therapist",
      approved: true,
      active: true,
      phone: "+919000010001",
      credentials: "MPT (Ortho), KSCP Reg 44821",
      specialization: "Spine and lower-limb rehabilitation",
      years_experience: 9,
      bio: "Works with desk-based patients on posture-driven back pain.",
      languages: "English, Kannada, Hindi",
      revenue_share_percent: 60,
      home_visit_revenue_share_percent: 65,
      visible_on_team: true,
      rating_visible: true,
      on_leave: false,
    },
  },
  {
    label: "Therapist B (isolation tests)",
    email: "qa.therapist.b@example.test",
    fullName: "QA Therapist B",
    profile: {
      role: "therapist",
      approved: true,
      active: true,
      phone: "+919000010002",
      credentials: "MPT (Neuro), KSCP Reg 44822",
      specialization: "Stroke and neurological rehabilitation",
      years_experience: 12,
      bio: "Post-stroke gait and balance retraining.",
      languages: "English, Hindi",
      revenue_share_percent: 55,
      // home_visit_revenue_share_percent left unset on purpose -- §8.8 uses
      // this therapist to prove the fallback to the online rate.
      visible_on_team: true,
      rating_visible: true,
      on_leave: false,
    },
  },
  {
    label: "Therapist C (leave / spare)",
    email: "qa.therapist.c@example.test",
    fullName: "QA Therapist C",
    profile: {
      role: "therapist",
      approved: true,
      active: true,
      phone: "+919000010003",
      credentials: "BPT, KSCP Reg 44823",
      specialization: "Paediatric physiotherapy",
      years_experience: 5,
      bio: "Early-intervention paediatric care.",
      languages: "English, Kannada",
      revenue_share_percent: 50,
      visible_on_team: true,
      rating_visible: true,
      // Left off leave: THR-AVAIL-006 and ADM-ROST-004 are what put this
      // therapist on leave, and a fixture that arrives already on leave
      // would make both pass before they ran.
      on_leave: false,
    },
  },

  // -- §8.9 Hospitals / partners -------------------------------------------
  // referral_code is generated the same way /api/admin/onboard-hospital
  // generates it, and only when the account does not already have one --
  // Patient C's registration link carries that code, so regenerating it on a
  // re-run would invalidate a code somebody has written down.
  {
    label: "Hospital A (main partner)",
    email: "qa.hospital@example.test",
    fullName: "QA Hospital Admin A",
    profile: {
      role: "hospital",
      approved: true,
      active: true,
      phone: "+918040010001",
      organization_name: "QA Sunrise Hospital",
      revenue_share_percent: 10,
    },
    needsReferralCode: true,
  },
  {
    label: "Hospital B (isolation)",
    email: "qa.hospital.b@example.test",
    fullName: "QA Hospital Admin B",
    profile: {
      role: "hospital",
      approved: true,
      active: true,
      phone: "+918040010002",
      organization_name: "QA Lakeside Clinic",
      revenue_share_percent: 12,
    },
    needsReferralCode: true,
  },
];

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Every auth user, indexed by lowercased email. listUsers pages at 1000 and
 *  there is no get-by-email in the admin API, so one pass builds the index
 *  the whole run reads. */
async function loadUsersByEmail() {
  const byEmail = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user);
    }
    if (data.users.length < 1000) return byEmail;
  }
}

function referralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function seed() {
  const existing = await loadUsersByEmail();
  const results = [];

  for (const account of ACCOUNTS) {
    const found = existing.get(account.email.toLowerCase());
    let userId = found?.id;
    let action = found ? "password reset" : "created";

    if (dryRun) {
      results.push({ ...account, action: found ? "would repair" : "would create", code: "-" });
      continue;
    }

    if (!found) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: PASSWORD,
        // Confirm email is off on this project by design (see AGENTS.md), and
        // an unconfirmed address cannot sign in even so -- this keeps the
        // seeded accounts usable whatever that setting is doing today.
        email_confirm: true,
        // `role` here is read by handle_new_user, which honours 'therapist'
        // and ignores anything else -- the same restriction a public signup
        // meets. It matters because trg_assign_profile_code runs BEFORE
        // INSERT: a row inserted as a patient and promoted afterwards keeps
        // its PT code for ever, so a therapist seeded without this reads as
        // PT0077 on every screen that shows a code. Hospitals deliberately do
        // NOT get the same treatment -- the trigger refuses 'hospital' by
        // design, and /api/admin/onboard-hospital promotes after insert too,
        // so a seeded partner carrying a PT code is exactly what the real
        // onboarding produces.
        user_metadata: { full_name: account.fullName, role: account.profile.role },
      });
      if (error || !data.user) {
        results.push({ ...account, action: `FAILED: ${error?.message ?? "no user"}`, code: "-" });
        continue;
      }
      userId = data.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(found.id, {
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) {
        results.push({ ...account, action: `FAILED: ${error.message}`, code: "-" });
        continue;
      }
    }

    // handle_new_user has inserted a profile row as a patient by now. This is
    // the service-role update that promotes it -- the same move
    // /api/admin/onboard-hospital and /api/admin/create-account make, and the
    // reason neither trusts signUp's user_metadata for a role.
    const patch = { ...account.profile, full_name: account.fullName, email: account.email };

    if (account.needsReferralCode) {
      const { data: row } = await admin
        .from("profiles")
        .select("referral_code")
        .eq("id", userId)
        .maybeSingle();
      patch.referral_code = row?.referral_code ?? referralCode();
    }

    const { data: updated, error: profileError } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (profileError) {
      results.push({ ...account, action: `FAILED: ${profileError.message}`, code: "-" });
      continue;
    }

    // No row came back, so handle_new_user did not insert one -- a database
    // that predates the trigger, or one where it was dropped. Writing it here
    // is the difference between an account that can sign in and one that
    // authenticates and then has no profile for the proxy to read.
    if (!updated) {
      const { error: insertError } = await admin.from("profiles").insert({ id: userId, ...patch });
      if (insertError) {
        results.push({ ...account, action: `FAILED: ${insertError.message}`, code: "-" });
        continue;
      }
      action += " + profile row created";
    }

    results.push({ ...account, action, code: patch.referral_code ?? "-" });
  }

  const width = Math.max(...results.map((r) => r.label.length));
  console.log(`\n${dryRun ? "DRY RUN -- nothing was written" : "Seeded"} against ${url}\n`);
  for (const r of results) {
    const code = r.code && r.code !== "-" ? `  referral code ${r.code}` : "";
    console.log(`  ${r.label.padEnd(width)}  ${r.email.padEnd(32)}  ${r.action}${code}`);
  }
  console.log(`\n  Password for every account above: ${PASSWORD}\n`);

  const failed = results.filter((r) => r.action.startsWith("FAILED"));
  if (failed.length > 0) {
    console.error(`${failed.length} account(s) failed. Nothing else was rolled back.`);
    process.exit(1);
  }

  await verifySignIn(results);

  console.log(
    "Not seeded, because a test creates them: service areas, home-visit packages,\n" +
      "therapist rosters, and each patient's saved address. Conditions and their\n" +
      "programmes survive the reset already. See test plan §23.2, phases 2 and 5.\n"
  );
}

/** Signs in as each account with the anon key, exactly as the login form
 *  does. Writing the rows is not the same claim as being able to log in --
 *  an unconfirmed address or a password that did not take would both look
 *  fine above and fail the tester at the door, which is the complaint this
 *  script exists to answer. Skipped when the anon key is not to hand. */
async function verifySignIn(results) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.log("  (set NEXT_PUBLIC_SUPABASE_ANON_KEY to have this script prove each login works)\n");
    return;
  }

  const failures = [];
  for (const r of results) {
    if (r.action.startsWith("FAILED")) continue;
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: r.email,
      password: PASSWORD,
    });
    if (error) failures.push(`${r.email}: ${error.message}`);
    await client.auth.signOut();
  }

  if (failures.length === 0) {
    console.log(`  Sign-in verified for all ${results.length} accounts.\n`);
    return;
  }
  console.error("  Sign-in FAILED for:");
  for (const f of failures) console.error(`    ${f}`);
  console.error("");
  process.exitCode = 1;
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
