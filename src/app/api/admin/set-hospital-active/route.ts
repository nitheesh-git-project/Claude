import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Suspends or restores a hospital partner.
//
// The dashboard has always *read* this flag -- a suspended hospital stops
// earning revenue share going forward, and both the partner list and the
// metrics revenue split already branch on `active === false` -- but nothing
// could ever set it. Patients and therapists each had a toggle; hospitals
// didn't, so that whole branch was unreachable in practice.
//
// Suspension is forward-looking only, deliberately: sessions already
// delivered keep whatever split applied when they happened, and the
// hospital's existing referrals are untouched. See the revenue-share comment
// in the admin dashboard's partner list for the same rule stated from the
// reading side.

type Body = { hospitalId?: string; active?: boolean };

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  const { hospitalId, active } = parsed.data;
  if (!hospitalId || typeof active !== "boolean") {
    return NextResponse.json({ error: "Missing hospitalId or active" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", hospitalId)
    .eq("role", "hospital")
    .select("id, organization_name")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Hospital not found" }, { status: 404 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "hospital.set_active",
    targetId: hospitalId,
    targetLabel: updated.organization_name,
    details: { active },
  });

  return NextResponse.json({ success: true, active });
}
