// Address formatting for home visits, dependency-free so the therapist
// card, the admin visit queue, the booking review step and the calendar
// event description all render the same address the same way.

export type VisitAddress = {
  line1?: string | null;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

// The same address as it is stored on an appointment, where every column
// carries a `visit_` prefix to keep it distinguishable from the patient's
// own address book. Adapting here rather than at each call site means the
// therapist card, the admin queue and the calendar event all agree on which
// column maps to which line.
export type AppointmentVisitColumns = {
  visit_address_line1?: string | null;
  visit_address_line2?: string | null;
  visit_landmark?: string | null;
  visit_city?: string | null;
  visit_state?: string | null;
  visit_pincode?: string | null;
  visit_latitude?: number | string | null;
  visit_longitude?: number | string | null;
};

export function visitAddressFromAppointment(a: AppointmentVisitColumns): VisitAddress {
  return {
    line1: a.visit_address_line1,
    line2: a.visit_address_line2,
    landmark: a.visit_landmark,
    city: a.visit_city,
    state: a.visit_state,
    pincode: a.visit_pincode,
    latitude: a.visit_latitude,
    longitude: a.visit_longitude,
  };
}

function parts(address: VisitAddress): string[] {
  return [
    address.line1,
    address.line2,
    address.landmark ? `near ${address.landmark}` : null,
    address.city,
    address.state,
    address.pincode,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
}

// One comma-separated line -- list rows, the calendar event's `location`
// field, and anywhere a full block would not fit.
export function formatAddressOneLine(address: VisitAddress): string {
  return parts(address).join(", ");
}

// Multi-line block for the therapist's session card, where the address is
// the primary thing on screen and readability beats compactness.
export function formatAddressBlock(address: VisitAddress): string[] {
  const streetLines = [address.line1, address.line2]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);

  const localityLine = [address.city, address.state, address.pincode]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(", ");

  const landmark = typeof address.landmark === "string" ? address.landmark.trim() : "";

  return [
    ...streetLines,
    ...(landmark ? [`Landmark: ${landmark}`] : []),
    ...(localityLine ? [localityLine] : []),
  ];
}

function coordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A Google Maps link the therapist can tap to navigate.
 *
 * Prefers the dropped pin's coordinates over the typed address whenever one
 * exists: Indian street addresses are often approximate enough that a text
 * search lands on the wrong lane, while the pin is what the patient
 * themselves confirmed. Falls back to the formatted address when the
 * booking has no pin (the map failed to load, or an admin typed the address
 * in by hand).
 *
 * Uses the universal cross-platform `?api=1` URL, which needs no API key and
 * opens the native Maps app on both Android and iOS.
 */
export function mapsSearchUrl(address: VisitAddress): string | null {
  const lat = coordinate(address.latitude);
  const lng = coordinate(address.longitude);
  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const line = formatAddressOneLine(address);
  if (!line) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
}
