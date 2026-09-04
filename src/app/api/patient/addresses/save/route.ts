import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive } from "@/lib/supabase/requireActiveProfile";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";

const MAX_LINE_LENGTH = 300;
const MAX_LABEL_LENGTH = 60;
const MAX_NOTES_LENGTH = 1000;

// Create or update one saved address. One route rather than two: the
// payloads are identical and the only difference is whether an id came
// along, so splitting them would mean two copies of the same validation.
//
// Deliberately NOT routed through profile_change_requests, unlike name and
// phone. A patient who mistyped their flat number has to be able to fix it
// before a therapist sets off, and an admin approval queue standing between
// them and that fix would be actively harmful -- the therapist would drive
// to the wrong address while the correction sat pending.
//
// isProfileActive rather than isProfileActiveAndApproved for the same
// reason home-visit checkout uses it: a patient who paid before approval
// still needs to manage the address that visit is going to.
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    label?: string | null;
    line1?: string;
    line2?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string;
    contactPhone?: string | null;
    accessNotes?: string | null;
    isDefault?: boolean;
  }>(request);
  if (parseError) return parseError;

  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }

  if (!body.line1?.trim()) {
    return NextResponse.json({ error: "A street address is required." }, { status: 400 });
  }
  if (body.line1.length > MAX_LINE_LENGTH) {
    return NextResponse.json({ error: "That address line is too long." }, { status: 400 });
  }
  if (body.label && body.label.length > MAX_LABEL_LENGTH) {
    return NextResponse.json({ error: "That label is too long." }, { status: 400 });
  }
  if (body.accessNotes && body.accessNotes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json({ error: "Access notes are too long." }, { status: 400 });
  }

  const pincode = normalizePincode(body.pincode);
  if (!isValidPincodeShape(pincode)) {
    return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Link the address to its service area when one covers this pincode. An
  // unserviceable pincode is still saved -- a patient may be adding an
  // address for an area we don't reach yet, and refusing to store it would
  // just make them retype it when we do.
  const { data: area } = await admin
    .from("home_visit_areas")
    .select("id")
    .eq("pincode", pincode)
    .eq("active", true)
    .maybeSingle();

  const columns = {
    label: body.label?.trim() || null,
    line1: body.line1.trim(),
    line2: body.line2?.trim() || null,
    landmark: body.landmark?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    pincode,
    area_id: area?.id ?? null,
    contact_phone: body.contactPhone?.trim() || null,
    access_notes: body.accessNotes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  // At most one default per patient is a partial unique index, so the old
  // default has to be cleared before the new one lands or the write fails.
  if (body.isDefault) {
    await admin
      .from("patient_addresses")
      .update({ is_default: false })
      .eq("patient_id", user.id)
      .eq("is_default", true);
  }

  if (body.id) {
    const { error } = await admin
      .from("patient_addresses")
      .update({ ...columns, ...(body.isDefault ? { is_default: true } : {}) })
      .eq("id", body.id)
      // Scoped to the caller: an id alone must never be enough to edit
      // somebody else's address.
      .eq("patient_id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: body.id });
  }

  const { data: created, error } = await admin
    .from("patient_addresses")
    .insert({
      patient_id: user.id,
      ...columns,
      is_default: !!body.isDefault,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: created.id });
}
