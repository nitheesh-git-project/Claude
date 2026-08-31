import type { createAdminClient } from "@/lib/supabase/admin";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";

type AdminClient = ReturnType<typeof createAdminClient>;

export type HomeVisitAddressPayload = {
  label?: string | null;
  line1?: string;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  mapPlaceId?: string | null;
  contactPhone?: string | null;
  accessNotes?: string | null;
  saveToAddressBook?: boolean;
};

export const MAX_ADDRESS_LINE_LENGTH = 300;
export const MAX_ACCESS_NOTES_LENGTH = 1000;

/**
 * Validating an address, checking it is somewhere the clinic actually
 * visits, and saving it — the three things every home-visit purchase has to
 * do before money moves.
 *
 * Extracted from /api/home-visit/create-order when care-plan purchases
 * became the only way to buy a multi-visit programme. That route had all of
 * this inline, and the care-plan route inserted a home-visit purchase with
 * no address and no travel fee at all — which the patient discovered later
 * as "this package has no saved address on file" at the moment they tried
 * to book, with the money already taken. One definition, two callers, so
 * the next purchase path cannot rediscover that bug.
 *
 * Serviceability is re-checked here rather than trusted from whatever the
 * browser was told earlier: the areas list is admin-editable and can change
 * between picking an address and paying, and this is the last point before
 * a charge. Taking payment for a visit nobody can travel to is the failure
 * this whole layer exists to prevent.
 */
export type ResolvedHomeVisitAddress = {
  /** The saved `patient_addresses` row a purchase is delivered against. */
  addressId: string | null;
  /** The serviceable area it fell in. */
  areaId: string;
  travelFeePaise: number;
  pincode: string;
};

export type AddressResolution =
  | { ok: true; address: ResolvedHomeVisitAddress }
  | { ok: false; status: number; error: string };

export async function resolveHomeVisitAddress(
  admin: AdminClient,
  patientId: string,
  input: { addressId?: string | null; address?: HomeVisitAddressPayload | null }
): Promise<AddressResolution> {
  // An address the patient already has on file. Preferred where it exists,
  // because a patient buying a recommended programme has usually been
  // visited before and retyping their own address is friction with nothing
  // behind it.
  if (input.addressId) {
    const { data: saved } = await admin
      .from("patient_addresses")
      .select("id, patient_id, pincode")
      .eq("id", input.addressId)
      .maybeSingle();
    // The ownership check is explicit rather than left to RLS: this runs
    // with the service-role client, which bypasses policies entirely.
    if (!saved || saved.patient_id !== patientId) {
      return { ok: false, status: 400, error: "That address isn't on your account." };
    }
    const pincode = normalizePincode(saved.pincode);
    const area = await lookupArea(admin, pincode);
    if (!area) {
      return {
        ok: false,
        status: 400,
        error: "We don't currently visit that address's pincode. Please choose or add another.",
      };
    }
    return {
      ok: true,
      address: {
        addressId: saved.id,
        areaId: area.id,
        travelFeePaise: area.travel_fee_paise,
        pincode,
      },
    };
  }

  const address = input.address;
  if (!address?.line1?.trim()) {
    return { ok: false, status: 400, error: "A street address is required." };
  }
  if (address.line1.length > MAX_ADDRESS_LINE_LENGTH) {
    return { ok: false, status: 400, error: "That address line is too long." };
  }
  if (address.accessNotes && address.accessNotes.length > MAX_ACCESS_NOTES_LENGTH) {
    return { ok: false, status: 400, error: "Access notes are too long." };
  }

  const pincode = normalizePincode(address.pincode);
  if (!isValidPincodeShape(pincode)) {
    return { ok: false, status: 400, error: "Enter a valid 6-digit pincode." };
  }

  const area = await lookupArea(admin, pincode);
  if (!area) {
    return {
      ok: false,
      status: 400,
      error: "We don't currently visit that pincode. Please check it and try again.",
    };
  }

  // Saving is best-effort in the original flow because the appointment
  // carries its own address snapshot regardless. It is NOT optional here:
  // a multi-visit purchase is booked against `default_address_id` later,
  // so a purchase with no saved address is a purchase that cannot be used.
  const { data: saved, error } = await admin
    .from("patient_addresses")
    .insert({
      patient_id: patientId,
      label: address.label?.trim() || null,
      line1: address.line1.trim(),
      line2: address.line2?.trim() || null,
      landmark: address.landmark?.trim() || null,
      city: address.city?.trim() || null,
      state: address.state?.trim() || null,
      pincode,
      area_id: area.id,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      map_place_id: address.mapPlaceId?.trim() || null,
      contact_phone: address.contactPhone?.trim() || null,
      access_notes: address.accessNotes?.trim() || null,
    })
    .select("id")
    .maybeSingle();

  if (error || !saved) {
    console.error("Could not save a home-visit address", error);
    return {
      ok: false,
      status: 500,
      error: "Could not save that address. Please try again.",
    };
  }

  return {
    ok: true,
    address: {
      addressId: saved.id,
      areaId: area.id,
      travelFeePaise: area.travel_fee_paise,
      pincode,
    },
  };
}

async function lookupArea(
  admin: AdminClient,
  pincode: string
): Promise<{ id: string; travel_fee_paise: number } | null> {
  const { data } = await admin
    .from("home_visit_areas")
    .select("id, travel_fee_paise, active")
    .eq("pincode", pincode)
    .eq("active", true)
    .maybeSingle();
  return data ? { id: data.id, travel_fee_paise: data.travel_fee_paise } : null;
}
