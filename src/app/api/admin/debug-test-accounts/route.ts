import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContextResult } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import {
  TEST_ACCOUNT_SET,
  batchTag,
  testAccountEmail,
  testAccountName,
  testAccountPassword,
  type TestAccountPlan,
  type TestAccountRow,
} from "@/lib/debugTestAccounts";

// The debug bar's Test accounts panel: make a set of throwaway logins, list
// them with their passwords, and remove them with everything they did.
//
// Gated three ways, all of which must pass:
//   1. The debug bar must be on for this deployment (isDebugNavVisible():
//      NEXT_PUBLIC_SHOW_DEBUG_NAV is not "false"). One switch for both, by
//      the owner's choice: wherever the bar shows, its panel works, and
//      switching the bar off on the live site switches this off with it.
//      Off, this answers 404, so a probe cannot learn the route is here.
//   2. The caller must be a signed-in admin...
//   3. ...with full scope. Making an approved therapist, or deleting
//      payments, is not a desk's call.
//
// Removal only ever reaches an account this route made: the database
// function refuses any id that is not in debug_test_accounts, so "Delete
// all" cannot touch a real person whatever it is sent.

function disabled() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function enabled(): boolean {
  return isDebugNavVisible();
}

async function guard() {
  const result = await getAdminContextResult();
  if (!result.ok) {
    if (result.reason === "unauthenticated") {
      return {
        response: NextResponse.json(
          { error: "Sign in as a Master Admin to use test accounts.", reason: "signed_out" },
          { status: 401 }
        ),
      } as const;
    }
    if (result.reason === "unavailable") {
      return {
        response: NextResponse.json(
          { error: "Could not check your access just now. Please try again.", retryable: true },
          { status: 503 }
        ),
      } as const;
    }
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  if (result.context.scope !== "full") {
    return {
      response: NextResponse.json(
        { error: "Only a Master Admin can make or remove test accounts.", reason: "scope" },
        { status: 403 }
      ),
    } as const;
  }
  return { context: result.context } as const;
}

const ROW_SELECT = "user_id, batch_id, role, admin_scope, label, email, password, created_at";

export async function GET() {
  if (!enabled()) return disabled();
  const g = await guard();
  if ("response" in g) return g.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("debug_test_accounts")
    .select(ROW_SELECT)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    // A database the schema has not reached is named, not reported as empty.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json(
        { error: "This database has not been updated yet. Re-apply supabase/schema.sql.", reason: "schema" },
        { status: 503 }
      );
    }
    return serverError("admin/debug-test-accounts list", error);
  }
  return NextResponse.json({ accounts: (data ?? []) as TestAccountRow[] });
}

type Body = { action?: string; userId?: string };

export async function POST(request: NextRequest) {
  if (!enabled()) return disabled();
  const g = await guard();
  if ("response" in g) return g.response;
  const context = g.context;

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;
  const action = parsed.data.action;
  const admin = createAdminClient();

  if (action === "create") {
    return createSet(admin, context.id);
  }

  if (action === "delete" || action === "delete_all") {
    let ids: string[];
    if (action === "delete") {
      const id = parsed.data.userId?.trim();
      if (!id) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      ids = [id];
    } else {
      const { data, error } = await admin.from("debug_test_accounts").select("user_id");
      if (error) return serverError("admin/debug-test-accounts delete_all list", error);
      ids = (data ?? []).map((r) => r.user_id as string);
    }

    const removed: string[] = [];
    const failed: { userId: string; error: string }[] = [];
    let rows = 0;
    for (const id of ids) {
      const { data, error } = await admin.rpc("debug_purge_test_account", { p_user_id: id });
      if (error) {
        console.error("debug_purge_test_account failed", id, error);
        failed.push({ userId: id, error: error.message?.slice(0, 200) || "The database refused." });
        continue;
      }
      removed.push(id);
      rows += Number((data as { rows?: number } | null)?.rows ?? 0);
    }

    if (removed.length > 0) {
      await recordAdminActivity(admin, context.id, {
        action: "debug.test_accounts.delete",
        targetId: null,
        targetLabel: `${removed.length} test account${removed.length === 1 ? "" : "s"}`,
        details: { removed: removed.length, rows, failed: failed.length },
      });
    }

    if (action === "delete" && failed.length > 0) {
      return NextResponse.json({ error: failed[0].error, removed, failed }, { status: 409 });
    }
    return NextResponse.json({ removed, failed, rows });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

type Admin = ReturnType<typeof createAdminClient>;

async function createSet(admin: Admin, actorId: string) {
  const random = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
  const tag = batchTag(random);
  const batchId = crypto.randomUUID();
  const made: TestAccountRow[] = [];

  // A pincode the clinic serves, so the test patient can book a home visit.
  const { data: area } = await admin
    .from("home_visit_areas")
    .select("id, city, pincode")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  for (const plan of TEST_ACCOUNT_SET) {
    const result = await createOne(admin, plan, tag, batchId, actorId, random, area ?? null);
    if ("error" in result) {
      // Everything made so far in this set is a test account already, so the
      // panel lists it and it can be deleted; say which one stopped the set.
      return NextResponse.json(
        {
          error: `Made ${made.length} of ${TEST_ACCOUNT_SET.length}: the ${plan.label.toLowerCase()} could not be created (${result.error}).`,
          accounts: made,
        },
        { status: 500 }
      );
    }
    made.push(result.row);
  }

  await recordAdminActivity(admin, actorId, {
    action: "debug.test_accounts.create",
    targetId: null,
    targetLabel: `Test set ${tag.toUpperCase()}`,
    details: { batchId, accounts: made.map((m) => ({ label: m.label, email: m.email })) },
  });

  return NextResponse.json({ accounts: made, batchId });
}

async function createOne(
  admin: Admin,
  plan: TestAccountPlan,
  tag: string,
  batchId: string,
  actorId: string,
  random: () => number,
  area: { id: string; city: string | null; pincode: string } | null
): Promise<{ row: TestAccountRow } | { error: string }> {
  const email = testAccountEmail(plan, tag);
  const password = testAccountPassword(tag, random);
  const fullName = testAccountName(plan, tag);
  const phone = `+9190000${String(Math.floor(random() * 100000)).padStart(5, "0")}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "no user returned" };
  }
  const userId = created.user.id;

  // Registered before anything else is written, so a set that fails halfway
  // still leaves only rows the purge is allowed to remove.
  const row: TestAccountRow = {
    user_id: userId,
    batch_id: batchId,
    role: plan.role,
    admin_scope: plan.adminScope,
    label: plan.label,
    email,
    password,
    created_at: new Date().toISOString(),
  };
  const { error: registerError } = await admin.from("debug_test_accounts").insert({ ...row, created_by: actorId });
  if (registerError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: registerError.message };
  }

  const profile: Record<string, unknown> = {
    role: plan.role,
    full_name: fullName,
    phone,
    approved: true,
    active: true,
  };
  if (plan.role === "therapist") {
    Object.assign(profile, {
      credentials: "MPT (Test)",
      specialization: "Orthopaedic",
      years_experience: 5,
      revenue_share_percent: 60,
      home_visit_revenue_share_percent: 65,
      visible_on_team: false,
      on_leave: false,
    });
  }
  if (plan.role === "hospital") {
    Object.assign(profile, {
      organization_name: `Test Hospital ${tag.toUpperCase()}`,
      referral_code: crypto.randomBytes(4).toString("hex").toUpperCase(),
      revenue_share_percent: 10,
    });
  }
  if (plan.role === "admin") profile.admin_scope = plan.adminScope;

  const { error: profileError } = await admin.from("profiles").update(profile).eq("id", userId);
  if (profileError) return { error: profileError.message };

  if (plan.role === "therapist") {
    // Full day, Monday to Saturday: bookable straight away.
    const hours: { therapist_id: string; day_of_week: number; hour: number }[] = [];
    for (let day = 1; day <= 6; day++) {
      for (let hour = 6; hour <= 23; hour++) hours.push({ therapist_id: userId, day_of_week: day, hour });
    }
    const { error } = await admin.from("therapist_availability_template").insert(hours);
    if (error) return { error: error.message };
  }

  if (plan.role === "patient" && area) {
    const { error } = await admin.from("patient_addresses").insert({
      patient_id: userId,
      label: "Home",
      line1: "12 Test Street",
      city: area.city,
      pincode: area.pincode,
      area_id: area.id,
      contact_phone: phone,
      is_default: true,
    });
    if (error) return { error: error.message };
  }

  return { row };
}
