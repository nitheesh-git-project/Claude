import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";
import { updateMeetEventForAppointment } from "@/lib/googleCalendarSync";
import { formatAddressOneLine } from "@/lib/formatAddress";

const MAX_LINE_LENGTH = 300;
const MAX_NOTES_LENGTH = 1000;

// Corrects the address on a booked home visit. Deliberately separate from
// /api/admin/update-appointment (which owns slot/therapist/category): a
// wrong flat number is the most common and most urgent thing to fix on a
// home visit -- a therapist is about to drive somewhere -- and it should not
// require re-submitting the whole booking form.
//
// This edits the appointment's OWN snapshot, not the patient's saved
// address. The snapshot is what the visit was and will be delivered to;
// rewriting the address book from here would silently change the patient's
// default for every future booking, which is not what "fix this visit"
// means.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    line1?: string;
    line2?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string;
    contactPhone?: string | null;
    accessNotes?: string | null;
  }>(request);
  if (parseError) return parseError;

  const { appointmentId } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (!body.line1?.trim()) {
    return NextResponse.json({ error: "A street address is required." }, { status: 400 });
  }
  if (body.line1.length > MAX_LINE_LENGTH) {
    return NextResponse.json({ error: "That address line is too long." }, { status: 400 });
  }
  if (body.accessNotes && body.accessNotes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json({ error: "Access notes are too long." }, { status: 400 });
  }

  const pincode = normalizePincode(body.pincode);
  if (!isValidPincodeShape(pincode)) {
    return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, visit_mode, patient_id, therapist_id, slot_time, duration_minutes, timezone, google_event_id, visit_area_id, home_visit_purchase_id"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (appointment.visit_mode !== "home_visit") {
    return NextResponse.json(
      { error: "That session isn't a home visit." },
      { status: 400 }
    );
  }

  // The area may change with the pincode -- an admin moving a visit to a
  // different pincode has to land it on that pincode's area, or the travel
  // fee recorded against the visit stops matching where it is going. An
  // unserviceable pincode is allowed here on purpose: an admin correcting
  // an address is making a deliberate operational decision, and blocking it
  // would leave the visit pointing at the wrong place instead.
  const { data: area } = await admin
    .from("home_visit_areas")
    .select("id, travel_fee_paise")
    .eq("pincode", pincode)
    .maybeSingle();

  const { error } = await admin
    .from("appointments")
    .update({
      visit_address_line1: body.line1.trim(),
      visit_address_line2: body.line2?.trim() || null,
      visit_landmark: body.landmark?.trim() || null,
      visit_city: body.city?.trim() || null,
      visit_state: body.state?.trim() || null,
      visit_pincode: pincode,
      visit_contact_phone: body.contactPhone?.trim() || null,
      visit_access_notes: body.accessNotes?.trim() || null,
      ...(area ? { visit_area_id: area.id, travel_fee_paise: area.travel_fee_paise } : {}),
      // The pin belonged to the old address. Clearing it is the honest
      // answer -- a stale pin pointing at the previous house is worse than
      // no pin, because the therapist would trust it over the text.
      visit_latitude: null,
      visit_longitude: null,
      visit_map_place_id: null,
    })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Push the new address to the calendar invite both parties already hold.
  // Best-effort: the address is corrected in the app either way, and a
  // Calendar failure must not make the fix look like it didn't happen.
  if (appointment.google_event_id && appointment.therapist_id && appointment.slot_time) {
    await updateMeetEventForAppointment(admin, {
      appointmentId,
      googleEventId: appointment.google_event_id,
      patientId: appointment.patient_id,
      therapistId: appointment.therapist_id,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      timezone: appointment.timezone,
      location: formatAddressOneLine({
        line1: body.line1,
        line2: body.line2,
        landmark: body.landmark,
        city: body.city,
        state: body.state,
        pincode,
      }),
      description: body.accessNotes?.trim()
        ? `Access notes: ${body.accessNotes.trim()}`
        : null,
    });
  }

  if (appointment.home_visit_purchase_id) {
    try {
      await admin.from("home_visit_purchase_events").insert({
        purchase_id: appointment.home_visit_purchase_id,
        event_type: "address_changed",
        actor_id: adminUser.id,
        appointment_id: appointmentId,
        detail: { pincode },
      });
    } catch (eventError) {
      console.error("Failed to log address_changed event", appointmentId, eventError);
    }
  }

  return NextResponse.json({ success: true, serviceable: !!area });
}
