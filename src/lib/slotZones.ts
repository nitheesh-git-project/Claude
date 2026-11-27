// A booked time said in both zones when the visitor is not on the clinic's.
//
// The booking wizard draws the picker on the visitor's own clock (Step 1 says
// "Times shown in UTC"), but the clinic confirms and runs the session in
// India time, and every screen after the picker used to print that alone: a
// visitor in UTC picked "10:00 am" and was then shown "3:30 pm" with no word
// of why. Both are the same instant; this says so.
//
// Dependency-free apart from the formatters, unit-tested.

import { formatClinicDateTime, formatDateTimeInZone } from "@/lib/formatDateTime";

export type SlotInZones = {
  /** The time on the clinic's clock, as every other screen prints it. */
  clinic: string;
  /** The time on the visitor's clock with its zone name, or null when the
   *  visitor is on the clinic's clock (nothing to add). */
  yours: string | null;
};

export function slotInZones(value: string | number | Date | null | undefined, visitorZone: string | null | undefined): SlotInZones {
  const clinic = formatClinicDateTime(value);
  if (!visitorZone || clinic === "-") return { clinic, yours: null };
  const yours = formatDateTimeInZone(value, visitorZone);
  if (!yours) return { clinic, yours: null };
  // Same clock reading as the clinic's (Asia/Calcutta, or any zone sharing
  // India's offset): say nothing extra.
  const yoursNoZone = yours.replace(/\s+[A-Z+\-0-9:]+$/, "");
  if (yoursNoZone.toLowerCase() === clinic.toLowerCase()) return { clinic, yours: null };
  return { clinic, yours };
}

/** One line: "28 Nov 2026, 3:30 pm IST (10:00 am UTC, your time)". */
export function describeSlotForVisitor(value: string | number | Date | null | undefined, visitorZone: string | null | undefined): string {
  const { clinic, yours } = slotInZones(value, visitorZone);
  if (!yours) return clinic;
  return `${yours} (${clinic} India time)`;
}
