// System Health's pricing question: does what each booking priced abroad
// charged follow from the Indian price and the markup it recorded?
//
// The staging test found an Indian test patient charged Rs 1,059.18 for a
// Rs 499 session, and System Health still read "Everything adds up" -- it
// checked that money was attached to something, never that the amount was
// the right one. Every booking priced for another country now records the
// Indian list price, the country and the markup (pricingSnapshotServer.ts),
// so the amount can be checked against them.
//
// Report only, never repair: a wrong price is a finding for a person.
// Dependency-free, so it is unit-tested.

export type PricedBookingRow = {
  id: string;
  patient_id: string;
  session_code?: string | null;
  slot_time: string | null;
  list_price_paise: number | null;
  home_list_price_paise: number | null;
  pricing_country: string | null;
  pricing_markup_percent: number | string | null;
};

export type PricingMismatch = {
  id: string;
  sessionCode: string | null;
  patientId: string;
  slotTime: string | null;
  problem: string;
};

/**
 * How far above the raised price the charge may sit. Converting to a local
 * currency and rounding UP to .99 (or .990, or ...9 for a currency with no
 * cents) adds a little; for the highest-value currencies one unit is a few
 * hundred rupees on a Rs 500 session, so a quarter is generous and a doubled
 * price is still caught.
 */
const ROUNDING_HEADROOM = 1.25;
/** Converting back to paise may land a paisa or so under the raised figure. */
const CONVERSION_SLACK_PAISE = 100;

export function pricingFindings(
  rows: PricedBookingRow[],
  accountCountryByPatient: ReadonlyMap<string, string | null>
): PricingMismatch[] {
  const findings: PricingMismatch[] = [];
  for (const r of rows) {
    if (!r.pricing_country) continue;
    const base = {
      id: r.id,
      sessionCode: r.session_code ?? null,
      patientId: r.patient_id,
      slotTime: r.slot_time,
    };
    const home = r.home_list_price_paise;
    const list = r.list_price_paise;
    // Null is "not recorded", never 0% (Number(null) would read it as 0).
    const markup = r.pricing_markup_percent === null ? NaN : Number(r.pricing_markup_percent);
    if (home === null || list === null || home <= 0 || !Number.isFinite(markup)) {
      findings.push({ ...base, problem: "Priced abroad, but its Indian price or markup was not recorded." });
      continue;
    }
    const raised = Math.round((home * (100 + markup)) / 100);
    if (list < raised - CONVERSION_SLACK_PAISE) {
      findings.push({
        ...base,
        problem: `Charged below its own price: ${rupees(list)} against ${rupees(home)} + ${markup}% = ${rupees(raised)}.`,
      });
      continue;
    }
    if (list > raised * ROUNDING_HEADROOM) {
      findings.push({
        ...base,
        problem: `Charged far above its own price: ${rupees(list)} against ${rupees(home)} + ${markup}% = ${rupees(raised)}.`,
      });
      continue;
    }
    const account = accountCountryByPatient.get(r.patient_id) ?? null;
    if (account === "IN" && r.pricing_country !== "IN") {
      findings.push({
        ...base,
        problem: `Priced for ${r.pricing_country} (+${markup}%), but the patient's account is Indian. Usually the debug bar's country was left set.`,
      });
    }
  }
  return findings;
}

function rupees(paise: number): string {
  return `Rs ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
