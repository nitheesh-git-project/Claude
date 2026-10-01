import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";
import { serverError } from "@/lib/apiError";
import { lookupServiceArea } from "@/lib/serviceAreaServer";

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

  const activeStanding = await isProfileActive(user.id);
  if (activeStanding === null) return profileCheckUnavailable();
  if (!activeStanding) {
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
  // just make them retype it when we do. A read that *failed* is different:
  // saving with no area would quietly misdescribe a served address.
  const lookup = await lookupServiceArea(admin, pincode);
  if (!lookup.ok) {
    return NextResponse.json(
      { error: "We couldn't save that address just now. Please try again." },
      { status: 503 }
    );
  }

  const columns = {
    label: body.label?.trim() || null,
    line1: body.line1.trim(),
    line2: body.line2?.trim() || null,
    landmark: body.landmark?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    pincode,
    area_id: lookup.area?.id ?? null,
    contact_phone: body.contactPhone?.trim() || null,
    access_notes: body.accessNotes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  // The address itself is saved FIRST, with its default flag untouched.
  // This used to clear the old default before saving, so a save that then
  // failed left the patient with no default address at all -- and an update
  // to an id that did not exist answered success having changed nothing.
  let addressId: string;
  if (body.id) {
    const { data: updated, error } = await admin
      .from("patient_addresses")
      .update(columns)
      .eq("id", body.id)
      // Scoped to the caller: an id alone must never be enough to edit
      // somebody else's address.
      .eq("patient_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return serverError("patient/addresses/save", error);
    if (!updated) {
      return NextResponse.json(
        { error: "That address no longer exists. Refresh to see your saved addresses." },
        { status: 404 }
      );
    }
    addressId = updated.id;
  } else {
    const { data: created, error } = await admin
      .from("patient_addresses")
      .insert({ patient_id: user.id, ...columns, is_default: false })
      .select("id")
      .single();
    if (error || !created) return serverError("patient/addresses/save", error);
    addressId = created.id;
  }

  if (body.isDefault) {
    const moved = await makeDefaultAddress(admin, user.id, addressId);
    if (!moved.ok) {
      return NextResponse.json(
        {
          error: moved.conflict
            ? "Another change set your default address a moment ago. Refresh to see it."
            : "Your address was saved, but we couldn't make it your default. Please try again.",
          id: addressId,
        },
        { status: moved.conflict ? 409 : 503 }
      );
    }
  }

  return NextResponse.json({ success: true, id: addressId });
}

/**
 * Moves the default to `addressId`, and puts the old one back if that fails.
 *
 * At most one default per patient is a partial unique index, so the old
 * default has to be cleared before the new one can be set. Done after the
 * address is safely saved, and undone on failure, so the one state this can
 * no longer leave behind is "no default at all".
 */
async function makeDefaultAddress(
  admin: ReturnType<typeof createAdminClient>,
  patientId: string,
  addressId: string
): Promise<{ ok: true } | { ok: false; conflict: boolean }> {
  const { data: previous, error: readError } = await admin
    .from("patient_addresses")
    .select("id")
    .eq("patient_id", patientId)
    .eq("is_default", true)
    .maybeSingle();
  if (readError) return { ok: false, conflict: false };
  if (previous?.id === addressId) return { ok: true };

  if (previous) {
    const { error: clearError } = await admin
      .from("patient_addresses")
      .update({ is_default: false })
      .eq("id", previous.id)
      .eq("patient_id", patientId);
    if (clearError) return { ok: false, conflict: false };
  }

  const { error: setError } = await admin
    .from("patient_addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("patient_id", patientId);
  if (!setError) return { ok: true };

  // Put the old default back so the patient is never left without one.
  if (previous) {
    const { error: restoreError } = await admin
      .from("patient_addresses")
      .update({ is_default: true })
      .eq("id", previous.id)
      .eq("patient_id", patientId);
    if (restoreError) {
      console.error("addresses/save: could not restore previous default", previous.id, restoreError.message);
    }
  }
  // 23505 is patient_addresses_one_default: another tab set a default in
  // the window. Not a server fault -- the honest answer is that it is set.
  return { ok: false, conflict: setError.code === "23505" };
}
