// What a patient on pay-later terms is asked to settle, and how the "I've
// paid" form pre-fills it. Integer paise throughout (CLAUDE.md).
//
// A pay-later balance is settled by hand -- cash at the clinic, UPI, a bank
// transfer -- in whole rupees: there is no 18-paise coin, and nobody types
// ₹1,059.18 into a UPI app. A due with paise in it (a percentage discount on
// a converted price produces them) could never be paid off exactly: the
// patient paid ₹1,059 and their dashboard said "You owe ₹0.18" for ever.
// So the due is the checkout total rounded DOWN to the rupee -- the clinic
// gives up the paise, the patient is never asked for more than they were
// quoted -- and the form pre-fills the exact balance, paise and all, for
// any balance written before this rule.
//
// Dependency-free, unit-tested.

/** The pay-later due for a checkout total: down to the whole rupee. A total
 *  under one rupee is left as it is rather than rounded to nothing. */
export function payLaterDuePaise(totalPaise: number): number {
  if (!Number.isFinite(totalPaise) || totalPaise <= 0) return 0;
  const whole = Math.floor(totalPaise / 100) * 100;
  return whole > 0 ? whole : Math.round(totalPaise);
}

/** The amount field's text for a balance: "1059" for whole rupees,
 *  "1059.18" when there are paise -- never rounded away. */
export function rupeesInputValue(paise: number): string {
  const p = Math.max(0, Math.round(Number.isFinite(paise) ? paise : 0));
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);
}
