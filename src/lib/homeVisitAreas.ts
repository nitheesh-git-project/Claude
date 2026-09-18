// Serviceability lookup for home visits. Dependency-free so the booking
// wizard (client), the check-area route (server) and the admin Service
// Areas tab all decide "can we reach this pincode?" with one implementation
// instead of three slightly different string comparisons.

export type ServiceArea = {
  id: string;
  city: string;
  area_name: string | null;
  pincode: string;
  travel_fee_paise: number;
  active: boolean;
};

// Patients type pincodes with spaces ("600 020"), and Google Places
// sometimes returns them that way too, so a serviceable area must never be
// missed over separators.
//
// Only separators are stripped, though -- not every non-digit. Stripping
// `\D` outright meant any string with six digits buried in it normalised to
// a pincode: an audit probe sent `560001'; drop table profiles; --` and the
// route answered a confident "yes, we visit that area". Nothing was injected
// (supabase-js parameterises, and the table was still there afterwards), but
// answering a question the caller did not ask is the "never tell someone
// something untrue" rule, and it is the one place this app promises to send
// a therapist to an address. Junk now fails `isValidPincodeShape` instead.
export function normalizePincode(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\s\-\u2010-\u2015]/g, "");
}

export function findAreaForPincode(
  areas: ServiceArea[],
  pincode: string | null | undefined
): ServiceArea | null {
  const target = normalizePincode(pincode);
  if (!target) return null;
  return (
    areas.find((a) => a.active !== false && normalizePincode(a.pincode) === target) ?? null
  );
}

export function isServiceable(
  areas: ServiceArea[],
  pincode: string | null | undefined
): boolean {
  return findAreaForPincode(areas, pincode) !== null;
}

// An Indian pincode is exactly six digits and never starts with zero. Only
// a shape check -- whether we actually serve it is findAreaForPincode's
// job, and this exists so the wizard can say "that isn't a pincode" before
// spending a round trip to find out we don't serve it.
export function isValidPincodeShape(raw: string | null | undefined): boolean {
  return /^[1-9]\d{5}$/.test(normalizePincode(raw));
}
