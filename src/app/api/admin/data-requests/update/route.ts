import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  allowedDataRequestMoves,
  allowedGrievanceMoves,
  needsNote,
  type DataRequestStatus,
  type GrievanceStatus,
} from "@/lib/dataRequests";
import { sendEmail } from "@/lib/emailServer";
import {
  deletionCompletedEmail,
  deletionDeclinedEmail,
  grievanceAcknowledgedEmail,
  grievanceResolvedEmail,
  type Email,
} from "@/lib/legalEmails";
import { legalEmailContext } from "@/lib/legalEmailContext";

// Moves a deletion request or a grievance to its next status.
//
// POST { type: "deletion" | "grievance", id, to, note? }
// -> 200 { success: true }
//    400 a move that is not allowed from where the case is, or a missing
//        note (declining a request, or closing a grievance, says why/how);
//    403; 404; 409 somebody else moved it first (the update is claimed on
//    the status the screen showed, so two admins cannot both close it).
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<{ type?: unknown; id?: unknown; to?: unknown; note?: unknown }>(request);
  if (parseError) return parseError;
  const { type, id, to } = body;
  if ((type !== "deletion" && type !== "grievance") || typeof id !== "string" || typeof to !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (needsNote(to as DataRequestStatus | GrievanceStatus) && note.length < 3) {
    return NextResponse.json(
      { error: to === "rejected" ? "Say why the request is declined -- the person is told." : "Say how it was resolved." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const table = type === "deletion" ? "data_requests" : "grievances";
  const { data: current, error: readError } = await admin
    .from(table)
    .select(type === "deletion" ? "status, reference, contact_name, contact_email" : "status, reference, name, email")
    .eq("id", id)
    .maybeSingle<{ status: string; reference: string; contact_name?: string | null; contact_email?: string | null; name?: string; email?: string }>();
  if (readError) return NextResponse.json({ error: "Could not read that case. Please try again." }, { status: 503 });
  if (!current) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const from = current.status as string;
  const allowed =
    type === "deletion"
      ? allowedDataRequestMoves(from as DataRequestStatus)
      : allowedGrievanceMoves(from as GrievanceStatus);
  if (!(allowed as string[]).includes(to)) {
    return NextResponse.json({ error: `A case that is "${from}" cannot move to "${to}".` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    type === "deletion"
      ? {
          status: to,
          updated_at: now,
          ...(to === "completed" || to === "rejected" ? { resolved_at: now, resolved_by: adminUser.id } : {}),
          ...(note ? { resolution_note: note } : {}),
        }
      : {
          status: to,
          handled_by: adminUser.id,
          ...(to === "acknowledged" ? { acknowledged_at: now } : {}),
          ...(to === "resolved" ? { resolved_at: now, resolution_note: note } : {}),
        };
  // A grievance closed straight from "new" was still acknowledged.
  if (type === "grievance" && to === "resolved" && from === "new") patch.acknowledged_at = now;

  const { data: updated, error } = await admin.from(table).update(patch).eq("id", id).eq("status", from).select("id");
  if (error) return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Somebody else updated this case a moment ago. Refresh to see it." }, { status: 409 });
  }

  // Tell the person. A closed deletion request then forgets who to write to
  // (contact_* exist only so this email could still be sent).
  const { brand, officerEmail } = await legalEmailContext(request);
  let recipient: string | null = null;
  let message: Email | null = null;
  if (type === "grievance") {
    recipient = current.email ?? null;
    const name = current.name ?? "there";
    if (to === "acknowledged") message = grievanceAcknowledgedEmail(brand, { name, reference: current.reference });
    if (to === "resolved") message = grievanceResolvedEmail(brand, { name, reference: current.reference, resolution: note });
  } else if (to === "completed" || to === "rejected") {
    recipient = current.contact_email ?? null;
    const name = current.contact_name ?? "there";
    message =
      to === "completed"
        ? deletionCompletedEmail(brand, { name, reference: current.reference })
        : deletionDeclinedEmail(brand, { name, reference: current.reference, reason: note });
  }
  const emailed = recipient && message ? await sendEmail(recipient, message, { kind: "legal", replyTo: officerEmail }) : "skipped";
  if (type === "deletion" && (to === "completed" || to === "rejected")) {
    await admin.from("data_requests").update({ contact_name: null, contact_email: null }).eq("id", id);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: type === "deletion" ? "data_request.update" : "grievance.update",
    targetId: id,
    targetLabel: current.reference as string,
    // The from/to only: a note is free text about a person.
    details: { from, to, noteLength: note.length, emailed },
  });
  return NextResponse.json({ success: true });
}
