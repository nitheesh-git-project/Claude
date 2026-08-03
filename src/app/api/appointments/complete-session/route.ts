import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Marks a confirmed session as completed. Callable by the therapist who ran
// the session, or an admin correcting the record — nobody else. There's no
// time gate: the therapist typically does this right after the call ends,
// which is naturally after slot_time, but an admin may also need to
// backfill an older session, so this doesn't try to guess "is it over yet".
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    noShow?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, noShow } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, status, therapist_id")
    .eq("id", appointmentId)
    .single();
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const adminUser = await getAdminUser();
  const isOwningTherapist = appointment.therapist_id === user.id;
  if (!adminUser && !isOwningTherapist) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (appointment.status !== "confirmed") {
    return NextResponse.json(
      { error: "Only confirmed sessions can be marked completed." },
      { status: 400 }
    );
  }

  // Atomic claim, same pattern as cancelAppointmentAndRefund's — the plain
  // read-then-write this used to be let two concurrent requests (e.g. a
  // therapist clicking Done while an admin clicks No-Show, or a patient
  // cancelling — and getting refunded — at the same moment) both pass the
  // status check above and then unconditionally overwrite each other. Worse,
  // an unconditional write here could resurrect a just-cancelled-and-refunded
  // appointment back to "completed", making it look payout-eligible again.
  // Requiring status still be 'confirmed' at write time closes both cases.
  const { data: updated, error } = await admin
    .from("appointments")
    .update({ status: "completed", no_show: !!noShow })
    .eq("id", appointmentId)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "This session was already updated — please refresh and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
