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
import { MINIMUM_CHARGE_PAISE } from "@/lib/discounts";

/** The columns a discount is recorded in (goodwill, the first-session offer). */
export type SessionListPriceRow = SessionAmountRow & {
  list_price_paise?: number | null;
  discount_paise?: number | null;
};

export function sessionListPricePaise(
  a: SessionListPriceRow,
  servicePricePaise: number | null | undefined
): number {
  // Nothing paid and no amount due written yet, but a discount recorded: the
  // patient is quoted list price less the discount (floored at the gateway
  // minimum, as applyGoodwillDiscount does), so that is what an admin reads.
  // The goodwill session showed the service's full price here -- Rs 499 --
  // while the patient and the therapist both saw the Rs 399 they would pay.
  if (a.amount_paid_paise == null && a.amount_due_paise == null) {
    const list = a.list_price_paise ?? 0;
    const off = a.discount_paise ?? 0;
    if (list > 0 && off > 0) return Math.max(MINIMUM_CHARGE_PAISE, list - off);
  }
  return sessionAmountPaise(
    a,
    typeof servicePricePaise === "number" ? servicePricePaise : SESSION_FEE_PAISE
  );
}
