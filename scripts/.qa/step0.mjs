import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const admin = createClient(URL_, SVC, { auth: { persistSession: false } });

async function cookieFor(email, password = "QaTest!2024pass") {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
  const collected = [];
  const ssr = createServerClient(URL_, ANON, {
    cookies: { getAll: () => [], setAll: (cs) => cs.forEach(({ name, value }) => collected.push({ name, value })) },
  });
  await ssr.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  return collected.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
}

const TABLES = ["communication_flags", "contact_reveal_log", "risk_signals", "risk_reviews",
  "care_plans", "care_plan_versions", "appointments", "payments", "patient_package_purchases",
  "treatment_categories", "session_notes", "pain_assessments"];

async function counts(label) {
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    out[t] = error ? `ERR ${error.code}` : count;
  }
  console.log(`\n=== counts ${label} ===`);
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(28)} ${v}`);
  return out;
}

const before = await counts("BEFORE reset");

// Gate 2: no session at all.
const anonRes = await fetch(`${BASE}/api/admin/debug-reset`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ confirm: "RESET ALL DATA" }),
});
console.log(`\nSETUP-RESET gate (no auth): HTTP ${anonRes.status} ${JSON.stringify(await anonRes.json().catch(() => null))}`);

const cookie = await cookieFor("qa.admin@example.test");

// Gate 4: wrong phrase.
const wrongRes = await fetch(`${BASE}/api/admin/debug-reset`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ confirm: "reset all data" }),
});
console.log(`gate (wrong phrase):        HTTP ${wrongRes.status} ${JSON.stringify(await wrongRes.json().catch(() => null))}`);

// The real thing.
const res = await fetch(`${BASE}/api/admin/debug-reset`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ confirm: "RESET ALL DATA" }),
});
console.log(`gate (correct phrase):      HTTP ${res.status} ${JSON.stringify(await res.json().catch(() => null))}`);

const after = await counts("AFTER reset");

console.log("\n=== F-01 verdict ===");
for (const t of ["communication_flags", "risk_signals", "risk_reviews", "care_plans", "care_plan_versions", "contact_reveal_log"]) {
  const b = before[t], a = after[t];
  const cleared = a === 0;
  console.log(`  ${t.padEnd(24)} ${String(b).padStart(4)} -> ${String(a).padStart(4)}  ${b === 0 ? "(was already empty — inconclusive)" : cleared ? "CLEARED" : "*** SURVIVED THE RESET ***"}`);
}
const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
console.log(`\nadmins surviving: ${admins?.length ?? 0}`);
