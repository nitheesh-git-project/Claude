#!/usr/bin/env node
// Removes the fixture rows the e2e suite writes straight into the database,
// and which it used to leave behind.
//
// Why this exists: three specs insert a home-visit purchase, an appointment
// or a referral directly rather than through the booking routes -- that is
// the point of them, since each races a route that has to be *given*
// something to race over. A direct insert never claims `visits_used`, so the
// ledger backfill reserves a credit the legacy counter has never heard of,
// and `verify_entitlement_balances()` reports the disagreement for ever:
// nothing sweeps it. A direct insert never asks Google for a calendar event
// either, so the same appointment is also a "session with no video link".
// Nine runs put nine of each on Settings -> System Health, permanently red,
// and not one of them described anything wrong with the product.
//
// The specs clean up after themselves now (see E2E_MARKERS in
// e2e/helpers.ts). This clears what earlier runs already left, and is safe
// to re-run: it selects by the same literal markers and touches nothing
// else.
//
// Usage:
//   node scripts/clean-e2e-residue.mjs           # say what it would delete
//   node scripts/clean-e2e-residue.mjs --apply   # delete it
//
// Counting needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Deleting additionally needs SUPABASE_ACCESS_TOKEN, because it runs as one
// SQL transaction over the Management API rather than as a series of REST
// calls -- see the comment above the statement itself for why the REST path
// cannot finish the job. Same token `scripts/run-schema.mjs` uses:
// https://supabase.com/dashboard/account/tokens
//
// It writes with full privilege and deletes money records. Never point it at
// a database with real patients; nothing it matches can exist in one, since
// every marker is a literal string only the e2e suite writes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(rootDir, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // .env.local may not exist -- rely on real env vars instead.
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const apply = process.argv.includes("--apply");

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Put both in .env.local (the service role key, not the anon key) and try again."
  );
  process.exit(1);
}

// Kept byte-identical to E2E_MARKERS in e2e/helpers.ts, and to the literals
// in the SQL below. Two copies because this is a plain .mjs script and that
// is a TypeScript module the Next build owns; changing one means changing
// the others.
const MARKERS = {
  visitAddressLine1: "E2E Race Test Road",
  savedAddressLine1: "E2E Bulk Limit Test Address",
  referralNamePrefix: "E2E Race Referral",
  fakePaymentIdPrefix: "pay_e2erace",
};

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function die(what, error) {
  console.error(`Could not read ${what}: ${error.message}`);
  process.exit(1);
}

/** What is there, by the same markers the delete uses. */
async function survey() {
  const { data: appointments, error: apptError } = await admin
    .from("appointments")
    .select("id, session_code, home_visit_purchase_id")
    .eq("visit_address_line1", MARKERS.visitAddressLine1);
  if (apptError) die("appointments", apptError);

  const { data: addresses, error: addressError } = await admin
    .from("patient_addresses")
    .select("id")
    .eq("line1", MARKERS.savedAddressLine1);
  if (addressError) die("patient_addresses", addressError);
  const addressIds = (addresses ?? []).map((a) => a.id);

  const byAddress = addressIds.length
    ? await admin
        .from("home_visit_package_purchases")
        .select("id")
        .in("default_address_id", addressIds)
    : { data: [], error: null };
  if (byAddress.error) die("home_visit_package_purchases", byAddress.error);

  // The refund race's own purchase, found by the uncapturable payment id it
  // mints -- it has no appointment and no saved address to be found by.
  const { data: byPayment, error: payError } = await admin
    .from("home_visit_package_purchases")
    .select("id")
    .like("razorpay_payment_id", `${MARKERS.fakePaymentIdPrefix}%`);
  if (payError) die("home_visit_package_purchases", payError);

  const purchaseIds = [
    ...new Set([
      ...(appointments ?? []).map((a) => a.home_visit_purchase_id).filter(Boolean),
      ...(byAddress.data ?? []).map((p) => p.id),
      ...(byPayment ?? []).map((p) => p.id),
    ]),
  ];

  const { data: referrals, error: referralError } = await admin
    .from("patient_referrals")
    .select("id")
    .like("patient_name", `${MARKERS.referralNamePrefix}%`);
  if (referralError) die("patient_referrals", referralError);
  const referralIds = (referrals ?? []).map((r) => r.id);

  // Payments pointing at a purchase about to go. That foreign key is
  // ON DELETE SET NULL, so leaving one behind would trade one red check for
  // another: a captured payment attached to nothing.
  const payments = purchaseIds.length
    ? await admin.from("payments").select("id").in("target_home_visit_purchase_id", purchaseIds)
    : { data: [], error: null };
  if (payments.error) die("payments", payments.error);

  const entitlements = purchaseIds.length
    ? await admin
        .from("session_entitlements")
        .select("id")
        .in("legacy_home_visit_purchase_id", purchaseIds)
    : { data: [], error: null };
  if (entitlements.error) die("session_entitlements", entitlements.error);

  return {
    appointments: appointments ?? [],
    addressIds,
    purchaseIds,
    referralIds,
    paymentIds: (payments.data ?? []).map((p) => p.id),
    entitlementIds: (entitlements.data ?? []).map((e) => e.id),
  };
}

// One transaction, because a half-cleaned database is worse than an uncleaned
// one: the purchase gone and its payment left behind is a captured payment
// attached to nothing, which is a finding of its own on the same screen.
//
// It runs over the Management API rather than as REST deletes for one
// reason: `session_credit_ledger` refuses a DELETE by trigger, and the
// purchase cascades into it. That refusal is right -- the ledger is money,
// and "no route deletes it" is not the guarantee "a delete raises" is -- but
// these particular rows are not money. They are a backfill's reserve against
// an appointment a test inserted and never booked. So the trigger is lifted
// exactly the way debug_reset_all_data() lifts every constraint in the file,
// for these statements and nothing else, and restored before the
// transaction commits.
const DELETE_SQL = `
do $$
declare
  v_addresses uuid[];
  v_referrals uuid[];
  v_appointments uuid[];
  v_purchases uuid[];
  v_entitlements uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_addresses
    from patient_addresses where line1 = 'E2E Bulk Limit Test Address';

  select coalesce(array_agg(id), '{}') into v_referrals
    from patient_referrals where patient_name like 'E2E Race Referral%';

  select coalesce(array_agg(id), '{}') into v_appointments
    from appointments where visit_address_line1 = 'E2E Race Test Road';

  select coalesce(array_agg(distinct id), '{}') into v_purchases
    from home_visit_package_purchases
    where razorpay_payment_id like 'pay_e2erace%'
       or default_address_id = any (v_addresses)
       or id in (
            select home_visit_purchase_id from appointments
            where id = any (v_appointments) and home_visit_purchase_id is not null
          );

  select coalesce(array_agg(id), '{}') into v_entitlements
    from session_entitlements where legacy_home_visit_purchase_id = any (v_purchases);

  alter table session_credit_ledger disable trigger trg_session_credit_ledger_append_only;
  delete from session_credit_ledger
    where entitlement_id = any (v_entitlements)
       or appointment_id = any (v_appointments);
  alter table session_credit_ledger enable trigger trg_session_credit_ledger_append_only;

  delete from session_entitlements where id = any (v_entitlements);

  -- appointments.home_visit_purchase_id and .referral_id carry no ON DELETE
  -- behaviour, and home_visit_package_purchases.default_address_id points at
  -- an address, so the order below is the order the foreign keys allow.
  delete from appointments where id = any (v_appointments);
  delete from appointments where referral_id = any (v_referrals);
  delete from payments where target_home_visit_purchase_id = any (v_purchases);
  delete from home_visit_package_purchases where id = any (v_purchases);
  delete from patient_referrals where id = any (v_referrals);
  delete from patient_addresses where id = any (v_addresses);
end $$;
`;

async function runDelete() {
  const projectRef = new URL(url).hostname.split(".")[0];
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: DELETE_SQL }),
    }
  );
  if (!res.ok) {
    console.error(`\nThe delete failed (HTTP ${res.status}):\n${await res.text()}`);
    console.error(
      res.status === 401
        ? "\nSUPABASE_ACCESS_TOKEN was rejected. Generate a fresh personal access token at\n" +
            "https://supabase.com/dashboard/account/tokens and set it in .env.local."
        : "\nNothing was deleted: the whole thing runs as one transaction."
    );
    process.exit(1);
  }
}

async function main() {
  const found = await survey();
  const plan = [
    ["appointments (fixture home visits)", found.appointments.length],
    ["payments (uncapturable fixture captures)", found.paymentIds.length],
    ["session_entitlements (+ their ledger rows)", found.entitlementIds.length],
    ["home_visit_package_purchases", found.purchaseIds.length],
    ["patient_referrals", found.referralIds.length],
    ["patient_addresses", found.addressIds.length],
  ];

  console.log(apply ? "Deleting:" : "Would delete (re-run with --apply):");
  for (const [what, count] of plan) console.log(`  ${String(count).padStart(4)}  ${what}`);
  if (found.appointments.length > 0) {
    console.log(
      `\n  session codes: ${found.appointments.map((a) => a.session_code ?? a.id).join(", ")}`
    );
  }

  const nothing =
    found.purchaseIds.length === 0 &&
    found.referralIds.length === 0 &&
    found.addressIds.length === 0 &&
    found.appointments.length === 0;
  if (nothing) {
    console.log("\nNothing to clean.");
    return;
  }
  if (!apply) return;

  if (!accessToken) {
    console.error(
      "\nMissing SUPABASE_ACCESS_TOKEN, which the delete needs (the counting above did not).\n" +
        "Generate one at https://supabase.com/dashboard/account/tokens and set it in .env.local.\n" +
        "Nothing has been deleted."
    );
    process.exit(1);
  }

  await runDelete();

  // Report the thing this was run for, rather than asking anyone to go and
  // reload a dashboard to find out whether it worked.
  const { data: mismatches, error } = await admin.rpc("verify_entitlement_balances");
  if (error) {
    console.log(`\nDone. (Could not re-run the balance check: ${error.message})`);
    return;
  }
  console.log(`\nDone. Balances that disagree now: ${(mismatches ?? []).length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
