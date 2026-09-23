// Turning an out-of-area request into a service area.
//
// The waitlist is the demand the clinic had to turn away: somebody tried to
// book from a pincode nobody visits, and their request sits on Catalog ->
// Service Areas waiting for a decision. Marking one **served** is that
// decision -- and on its own it changed a word on an admin screen and
// nothing else. The pincode was still unserved, so the next patient from
// that street was refused exactly as the first one had been, and the row
// saying otherwise was on a screen nobody would think to doubt.
//
// So marking served offers to open the area, prefilled from the request
// itself. This module is that judgement with the DOM and the database taken
// out: what the dialog should be filled with, where the travel fee came
// from, and whether there is anything to add at all.

export type WaitlistEntryLike = {
  pincode: string;
  city: string | null;
};

export type ServiceAreaLike = {
  city: string;
  area_name: string | null;
  pincode: string;
  travel_fee_paise: number;
};

export type AreaPrefill = {
  /** Already a service area -- there is nothing to add, and the dialog says
   *  so rather than offering an insert the route would refuse. */
  alreadyServed: boolean;
  city: string;
  areaName: string;
  /** Rupees, as the form's own text. A number this app cannot know is never
   *  invented: it is either read off the clinic's own nearby areas or left
   *  at zero for somebody to type. */
  travelFeeInr: string;
  /** Where the fee came from, for the sentence under the field. `city` is
   *  the clinic's own figure for that city, `none` means nobody has set one
   *  and zero is a placeholder rather than a price. */
  travelFeeSource: "city" | "none";
};

/** The commonest travel fee among the areas of one city.
 *
 *  Commonest rather than cheapest or dearest: a city usually has one figure
 *  with a couple of exceptions, and the exception is the thing an admin
 *  notices and changes. Ties go to the lower fee -- quoting a patient less
 *  than the clinic would have charged is a smaller wrong than the reverse,
 *  and it is on screen to be corrected either way. */
function commonestFeeForCity(
  areas: ServiceAreaLike[],
  city: string
): number | null {
  const wanted = city.trim().toLowerCase();
  if (!wanted) return null;
  const fees = areas
    .filter((a) => a.city.trim().toLowerCase() === wanted)
    .map((a) => a.travel_fee_paise);
  if (fees.length === 0) return null;

  const counts = new Map<number, number>();
  for (const fee of fees) counts.set(fee, (counts.get(fee) ?? 0) + 1);

  let best = fees[0];
  let bestCount = 0;
  for (const [fee, count] of counts) {
    if (count > bestCount || (count === bestCount && fee < best)) {
      best = fee;
      bestCount = count;
    }
  }
  return best;
}

/** Paise as the text a rupee field holds: whole rupees stay whole. */
export function paiseToInrInput(paise: number): string {
  if (!Number.isFinite(paise)) return "0";
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export function describeAreaPrefill(
  entry: WaitlistEntryLike,
  areas: ServiceAreaLike[]
): AreaPrefill {
  const pincode = entry.pincode.trim();
  const existing = areas.find((a) => a.pincode.trim() === pincode);
  const city = (entry.city ?? "").trim();

  if (existing) {
    // Already served. The city and fee shown are the clinic's own, not the
    // request's -- the request is what somebody typed, and this row is what
    // the clinic decided.
    return {
      alreadyServed: true,
      city: existing.city,
      areaName: existing.area_name ?? "",
      travelFeeInr: paiseToInrInput(existing.travel_fee_paise),
      travelFeeSource: "city",
    };
  }

  const fee = commonestFeeForCity(areas, city);
  return {
    alreadyServed: false,
    city,
    areaName: "",
    travelFeeInr: fee === null ? "0" : paiseToInrInput(fee),
    travelFeeSource: fee === null ? "none" : "city",
  };
}
