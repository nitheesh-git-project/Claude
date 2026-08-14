// Cash-on-visit reconciliation math, dependency-free.
//
// A home visit can be paid in cash at the patient's door. Between the
// therapist taking that money and handing it to the business, the therapist
// is holding company funds on nothing but their own assertion that they
// collected it. This module turns those two timestamps
// (cash_collected_at / cash_remitted_at) into the numbers the therapist's
// Earnings tab and the admin Cash Ledger both need, and into the net-off
// that keeps the exposure bounded: what the business owes a therapist is
// reduced by the cash they are already holding.

export type CashAppointment = {
  id: string;
  therapist_id: string | null;
  cash_collected_at: string | null;
  cash_collected_amount_paise: number | null;
  cash_remitted_at: string | null;
};

export type TherapistCashSummary = {
  therapistId: string;
  // Collected and not yet confirmed as handed over -- the live exposure.
  heldPaise: number;
  heldCount: number;
  // Collected and confirmed received by the business.
  remittedPaise: number;
  remittedCount: number;
  // Everything ever collected, held plus remitted.
  collectedPaise: number;
};

function amountOf(appointment: CashAppointment): number {
  return Math.max(0, appointment.cash_collected_amount_paise ?? 0);
}

export function computeTherapistCashSummary(
  therapistId: string,
  appointments: CashAppointment[]
): TherapistCashSummary {
  let heldPaise = 0;
  let heldCount = 0;
  let remittedPaise = 0;
  let remittedCount = 0;

  for (const appointment of appointments) {
    if (appointment.therapist_id !== therapistId) continue;
    // No collection timestamp means no money changed hands, whatever the
    // amount column happens to say -- the timestamp is the assertion, the
    // amount is only its size.
    if (!appointment.cash_collected_at) continue;

    const amount = amountOf(appointment);
    if (appointment.cash_remitted_at) {
      remittedPaise += amount;
      remittedCount += 1;
    } else {
      heldPaise += amount;
      heldCount += 1;
    }
  }

  return {
    therapistId,
    heldPaise,
    heldCount,
    remittedPaise,
    remittedCount,
    collectedPaise: heldPaise + remittedPaise,
  };
}

/**
 * What the business actually pays out after netting off cash in hand.
 *
 * Returns the split rather than a single number so the payout screens can
 * show the working -- "we owe you X, you're holding Y, so we transfer Z" is
 * the only version of this a therapist will accept without a support ticket.
 *
 * `netPayablePaise` floors at zero. When a therapist holds more cash than
 * they are owed, the business does not pay them a negative amount; the
 * remainder stays outstanding as `stillOwedToBusinessPaise` and is settled
 * by remittance, not by the payout run.
 */
export function computeNetPayout({
  owedPaise,
  cashHeldPaise,
}: {
  owedPaise: number;
  cashHeldPaise: number;
}): {
  owedPaise: number;
  cashHeldPaise: number;
  netPayablePaise: number;
  stillOwedToBusinessPaise: number;
} {
  const owed = Math.max(0, owedPaise);
  const held = Math.max(0, cashHeldPaise);
  return {
    owedPaise: owed,
    cashHeldPaise: held,
    netPayablePaise: Math.max(0, owed - held),
    stillOwedToBusinessPaise: Math.max(0, held - owed),
  };
}

// Oldest un-remitted collection per therapist, in whole days. Drives the
// admin Cash Ledger's ageing column -- a therapist holding ₹500 for two
// days is normal, the same ₹500 for three weeks is the thing this whole
// module exists to make visible.
export function oldestUnremittedAgeDays(
  appointments: CashAppointment[],
  nowMs: number
): number | null {
  let oldestMs: number | null = null;
  for (const appointment of appointments) {
    if (!appointment.cash_collected_at || appointment.cash_remitted_at) continue;
    const collectedMs = new Date(appointment.cash_collected_at).getTime();
    if (Number.isNaN(collectedMs)) continue;
    if (oldestMs === null || collectedMs < oldestMs) oldestMs = collectedMs;
  }
  if (oldestMs === null) return null;
  return Math.max(0, Math.floor((nowMs - oldestMs) / 86_400_000));
}
