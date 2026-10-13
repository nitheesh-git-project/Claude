// Seeds the fixed set of test accounts and catalog rows this suite's specs
// assume exist, idempotently -- safe to run against a fresh test/staging
// Supabase project or one that already has this data from a previous run.
// Never run this against a production project: it creates real auth users
// and (in concurrency.spec.ts) real Razorpay test-mode orders.
import { adminClient, QA_EMAILS, TEST_PASSWORD } from "./helpers";

const THERAPISTS = [
  { email: QA_EMAILS.therapistA, full_name: "QA Therapist A" },
  { email: QA_EMAILS.therapistB, full_name: "QA Therapist B" },
  { email: QA_EMAILS.therapistC, full_name: "QA Therapist C" },
];
const PATIENTS = [
  { email: QA_EMAILS.patientA, full_name: "QA Patient A" },
  { email: QA_EMAILS.patientB, full_name: "QA Patient B" },
];

async function ensureUser(
  admin: ReturnType<typeof adminClient>,
  email: string,
  full_name: string,
  role: "admin" | "therapist" | "patient" | "hospital"
) {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = existing.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role, full_name },
    });
    if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`);
    user = data.user;
  }
  await admin
    .from("profiles")
    .update({ role, full_name, approved: true, active: true })
    .eq("id", user.id);
  return user.id;
}

export default async function globalSetup() {
  if (!process.env.E2E_QA_PASSWORD) {
    throw new Error(
      "Set E2E_QA_PASSWORD in .env.local: the QA accounts' shared password, kept out of this public repo."
    );
  }
  const admin = adminClient();

  const qaAdminId = await ensureUser(admin, QA_EMAILS.admin, "QA Admin", "admin");
  // Scopes are narrowed and restored by the authorization spec. A run that
  // was interrupted mid-test can leave the QA admin narrowed, which then
  // hides whole sections from every later browser spec and looks like a
  // dashboard bug. Start every run from full access instead.
  await admin.from("profiles").update({ admin_scope: "full" }).eq("id", qaAdminId);
  await ensureUser(admin, QA_EMAILS.hospital, "QA Hospital", "hospital");
  for (const t of THERAPISTS) await ensureUser(admin, t.email, t.full_name, "therapist");
  for (const p of PATIENTS) await ensureUser(admin, p.email, p.full_name, "patient");
  // The dashboard tutorial opens by itself over a patient's, therapist's or
  // hospital's first visit and takes every click. Only
  // `dashboard-tutorial.spec.ts` is about it, and it clears the flag for the
  // account it uses; every other spec starts with it seen.
  await admin
    .from("profiles")
    .update({ onboarding_seen_at: new Date().toISOString() })
    .in("role", ["patient", "therapist", "hospital"])
    .like("email", "qa.%@example.test")
    .is("onboarding_seen_at", null);

  await admin
    .from("site_settings")
    .update({
      home_visit_enabled: true,
      home_visit_cash_enabled: true,
    })
    .not("id", "is", null);

  const { data: existingArea } = await admin
    .from("home_visit_areas")
    .select("id")
    .eq("pincode", "600017")
    .maybeSingle();
  if (!existingArea) {
    await admin.from("home_visit_areas").insert({
      city: "Chennai",
      area_name: "T Nagar",
      pincode: "600017",
      travel_fee_paise: 15000,
      active: true,
    });
  }

  // The clinic-wide home-visit price (Catalog -> Conditions -> Home visits):
  // one visit, no condition. Every condition without its own price is sold
  // at it on /home-visit, the booking hub and the wizard. At most one may be
  // active (home_visit_packages_one_rate_per_category), so this fixture only
  // switches itself on when no other clinic-wide price is -- a project whose
  // admin set one keeps theirs, and the fixture row stays for the specs that
  // read it by title.
  const [{ data: existingSingle }, { data: clinicWide }] = await Promise.all([
    admin
      .from("home_visit_packages")
      .select("id, active")
      .eq("title", "Single Home Visit")
      .maybeSingle(),
    admin
      .from("home_visit_packages")
      .select("id")
      .eq("active", true)
      .eq("visit_count", 1)
      .eq("care_plan_course", false)
      .is("category_id", null),
  ]);
  const clinicWidePriced = (clinicWide ?? []).length > 0;
  if (!existingSingle) {
    await admin.from("home_visit_packages").insert({
      title: "Single Home Visit",
      visit_count: 1,
      price_paise: 150000,
      travel_fee_included: false,
      active: !clinicWidePriced,
      visible_on_home_visit_page: true,
    });
  } else if (!existingSingle.active && !clinicWidePriced) {
    await admin.from("home_visit_packages").update({ active: true }).eq("id", existingSingle.id);
  }

  const { data: existingProgramme } = await admin
    .from("home_visit_packages")
    .select("id")
    .eq("title", "4-Visit Home Recovery Programme")
    .maybeSingle();
  if (!existingProgramme) {
    await admin.from("home_visit_packages").insert({
      title: "4-Visit Home Recovery Programme",
      visit_count: 4,
      price_paise: 500000,
      travel_fee_included: false,
      active: true,
      visible_on_home_visit_page: true,
    });
  }
}
