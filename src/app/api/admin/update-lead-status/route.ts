import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { parseDeclineReason } from "@/lib/declineReasons";

const ALLOWED_STATUSES = ["new", "contacted", "declined"];

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    leadId?: string;
    status?: string;
    reasonCode?: unknown;
    note?: unknown;
  }>(request);
  if (parseError) return parseError;
  const { leadId, status } = body;
  if (!leadId || !status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Missing leadId or invalid status" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Declining asks why, and records the inquiry on People -> Declined in the
  // same statement as the status change (decline_b2b_lead in schema.sql).
  if (status === "declined") {
    const reason = parseDeclineReason("hospital", { reasonCode: body.reasonCode, note: body.note });
    if (!reason.ok) {
      return NextResponse.json({ error: reason.error, code: "reason_required" }, { status: 400 });
    }
    const { data: outcome, error } = await admin.rpc("decline_b2b_lead", {
      p_lead_id: leadId,
      p_reason_code: reason.reasonCode,
      p_reason_note: reason.note,
      p_declined_by: adminUser.id,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "The decline-with-reason database update hasn't been applied yet. Ask an admin to re-run supabase/schema.sql.",
          },
          { status: 503 }
        );
      }
      return serverError("admin/update-lead-status", error);
    }
    if (outcome === "not_found") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (outcome === "onboarded") {
      return NextResponse.json(
        { error: "This lead has already been onboarded as a hospital" },
        { status: 400 }
      );
    }
    // 'already_declined' is a repeat: the first decline's record stands and
    // nothing new is logged.
    if (outcome === "declined") {
      await recordAdminActivity(admin, adminUser.id, {
        action: "lead.update_status",
        targetId: leadId,
        details: {
          status,
          reason: reason.reasonCode,
          noteLength: reason.note?.length ?? 0,
        },
      });
    }
    return NextResponse.json({ success: true });
  }

  // Onboarded leads carry a hospital account already - status shouldn't be
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
    return serverError("admin/update-lead-status", error);
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
