import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

const ALLOWED_STATUSES = ["new", "contacted", "declined"];

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { leadId, status } = await request.json();
  if (!leadId || !status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Missing leadId or invalid status" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Onboarded leads carry a hospital account already — status shouldn't be
  // hand-edited back to "new"/"declined" once that's happened.
  const { data: lead } = await admin
    .from("b2b_leads")
    .select("status")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.status === "onboarded") {
    return NextResponse.json(
      { error: "This lead has already been onboarded as a hospital" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("b2b_leads")
    .update({ status })
    .eq("id", leadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "lead.update_status",
    targetId: leadId,
    details: { status },
  });

  return NextResponse.json({ success: true });
}
