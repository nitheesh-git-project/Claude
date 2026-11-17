import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";

// Settings -> Sign-in & Security -> Phone sign-in: the one switch
// (phone_login_controls; rules in src/lib/phoneLogin.ts). "settings" scope.
//
// Request:  { enabled: boolean }
// Response: 200 { success: true, unchanged }, 400, 403, 503 (nothing changed).
// A `phone_login.set` audit row carries from and to.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Say whether phone sign-in is on." }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin.from("phone_login_controls").select("enabled").eq("id", 1).maybeSingle();
  if (readError) {
    const notMigrated = readError.code === "42P01" || readError.code === "PGRST205";
    return NextResponse.json(
      { error: notMigrated ? "Phone sign-in isn't available yet - the clinic's database is being updated." : "We couldn't check the current setting. Nothing was changed - please try again." },
      { status: 503 }
    );
  }
  const from = row?.enabled === true;
  if (from === body.enabled) return NextResponse.json({ success: true, unchanged: true });
  const { error } = await admin
    .from("phone_login_controls")
    .upsert({ id: 1, enabled: body.enabled, updated_by: adminUser.id, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return serverError("admin/phone-login/settings", error);

  await recordAdminActivity(admin, adminUser.id, {
    action: "phone_login.set",
    targetLabel: "Phone sign-in",
    details: { from, to: body.enabled },
  });
  return NextResponse.json({ success: true, unchanged: false });
}
