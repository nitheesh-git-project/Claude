import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cancel a code nobody has used yet. A redeemed one cannot be cancelled --
 *  stopping pay later for that patient is the switch on their profile. */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: body, error: parseError } = await parseJsonBody<{ id?: unknown }>(request);
  if (parseError) return parseError;
  if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trusted_patient_codes")
    .update({ status: "revoked", revoked_by: adminUser.id, revoked_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("status", "active")
    .select("id, code, patient_name")
    .maybeSingle();
  if (error) return serverError("admin/trusted-codes/revoke", error);
  if (!data) {
    return NextResponse.json(
      { error: "That code has already been used or cancelled. Refresh to see it now." },
      { status: 409 }
    );
  }
  await recordAdminActivity(admin, adminUser.id, {
    action: "trusted_code.revoke",
    targetId: data.id,
    targetLabel: `${data.code} for ${data.patient_name}`,
  });
  return NextResponse.json({ success: true });
}
