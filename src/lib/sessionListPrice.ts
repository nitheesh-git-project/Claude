// What a session is priced at on a screen that shows it to an admin: the
// All Sessions list, a patient's or therapist's session history, and the
// Session Details drawer those rows open.
//
// One function because those screens used to carry their own copy of the
// fallback chain, and the copies drifted: the list and both histories read
// "the amount on the session, else its service's price, else the standard
// fee", while the drawer skipped the middle step. So an admin booking for a
// ₹499 service, not yet paid, read ₹499 on the list and the patient's history
// and "₹1,999 (estimated)" in the drawer the row opened -- the global
// session fee printed over a price the system knew.
//
// The order is the honest one:
//   1. what was actually charged (`amount_paid_paise`), or the price frozen
//      for a pay-later booking (`amount_due_paise`) -- `sessionAmountPaise`,
//      the same reading every money module uses;
//   2. else the session's own service's price;
//   3. and only for a session with no service at all (a hospital-referred
//      booking), the standard session fee -- which is what booking such a
//      session charges (`readAppointmentServicePrice`).
//
// Display only. The money modules keep their own fallbacks on purpose (see
// sessionAmount.ts): a screen quoting a session at its service's price is a
// reasonable reading, while paying a therapist a share of a guessed amount is
// not. Dependency-free so it is tested without rendering.

import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { sessionAmountPaise, type SessionAmountRow } from "@/lib/sessionAmount";

export function sessionListPricePaise(
  a: SessionAmountRow,
  servicePricePaise: number | null | undefined
): number {
  return sessionAmountPaise(
    a,
    typeof servicePricePaise === "number" ? servicePricePaise : SESSION_FEE_PAISE
  );
}
