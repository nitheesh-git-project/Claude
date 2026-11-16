// The facts the legal pages need that only the owner can supply.
//
// Never invent one of these. A blank value is left out of the page, never
// shown as a placeholder: a public policy that reads "[Company name]" is
// worse than one that leaves the line out. `missingLegalFacts()` lists what
// is still blank so the gap is visible in a test run, not discovered by a
// regulator.
//
// DRAFT: the wording in src/lib/legal/ was written as a starting point for
// the owner's lawyer to review (Indian law: the DPDP Act 2023 and its 2025
// Rules, the IT Act 2000 and the SPDI Rules 2011, the Consumer Protection
// (E-Commerce) Rules 2020). It is not legal advice.

export type LegalFacts = {
  /** Registered legal name of the business, e.g. "MoveRestore Health Pvt Ltd". */
  entityName: string;
  /** Registered office address, one line. */
  registeredAddress: string;
  /** CIN, LLPIN or GSTIN, whichever identifies the entity. */
  registrationNumber: string;
  /** Grievance Officer -- required by the IT Rules and the E-Commerce Rules. */
  grievanceOfficerName: string;
  grievanceOfficerEmail: string;
  grievanceOfficerPhone: string;
  /** City whose courts have jurisdiction under the Terms. */
  jurisdictionCity: string;
  /** When the current versions of the policies took effect, YYYY-MM-DD. */
  effectiveDate: string;
};

export const LEGAL_FACTS: LegalFacts = {
  entityName: "",
  registeredAddress: "",
  registrationNumber: "",
  grievanceOfficerName: "Nitheesh M",
  grievanceOfficerEmail: "grievance@moverestorephysio.com",
  grievanceOfficerPhone: "+91 82772 04388",
  jurisdictionCity: "",
  effectiveDate: "2026-11-12",
};

/** The fields still blank, by key -- what the owner must fill before launch. */
export function missingLegalFacts(facts: LegalFacts = LEGAL_FACTS): (keyof LegalFacts)[] {
  return (Object.keys(facts) as (keyof LegalFacts)[]).filter((k) => facts[k].trim() === "");
}
