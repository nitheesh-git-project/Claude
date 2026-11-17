// Who has claimed which promo code -- Money -> Costs, under the codes.
//
// A claim is a row that carries a promo_code_id: an appointment (a single
// session), a programme purchase, or a home-visit programme purchase. It is
// "successful" once it was paid; a claim on a checkout that was never paid,
// or on a session since cancelled, is still listed (the code was used) but
// labelled for what it is, so the default view can show only the ones that
// count. Dependency-free so the shaping is unit-tested.

export type PromoClaimKind = "session" | "programme" | "home_visit_programme";
export type PromoClaimState = "paid" | "unpaid" | "cancelled";

export type PromoClaim = {
  id: string;
  kind: PromoClaimKind;
  patientId: string;
  patientName: string;
  patientCode: string | null;
  codeId: string;
  code: string;
  campaign: string | null;
  forWhat: string;
  claimedAt: string;
  discountPaise: number;
  state: PromoClaimState;
};

export const PROMO_CLAIM_KIND_LABEL: Record<PromoClaimKind, string> = {
  session: "Single session",
  programme: "Programme",
  home_visit_programme: "Home-visit programme",
};

export const PROMO_CLAIM_STATE_LABEL: Record<PromoClaimState, string> = {
  paid: "Paid",
  unpaid: "Not paid yet",
  cancelled: "Cancelled",
};

export type RawPromoClaimRow = {
  id: string;
  promo_code_id: string | null;
  patient_id: string;
  promo_claimed_at: string | null;
  created_at?: string | null;
  discount_paise: number | null;
  payment_status: string | null;
  status?: string | null;
  title: string | null;
};

/** One row as a claim, or null when it carries no code. */
export function toPromoClaim(
  kind: PromoClaimKind,
  row: RawPromoClaimRow,
  lookups: {
    codes: Map<string, { code: string; description: string | null }>;
    people: Map<string, { name: string | null; patientCode: string | null }>;
  }
): PromoClaim | null {
  if (!row.promo_code_id) return null;
  const code = lookups.codes.get(row.promo_code_id);
  if (!code) return null;
  const person = lookups.people.get(row.patient_id);
  const cancelled = row.status === "cancelled" || row.status === "refunded";
  const state: PromoClaimState = cancelled ? "cancelled" : row.payment_status === "paid" ? "paid" : "unpaid";
  return {
    id: `${kind}:${row.id}`,
    kind,
    patientId: row.patient_id,
    patientName: person?.name?.trim() || "Unnamed patient",
    patientCode: person?.patientCode ?? null,
    codeId: row.promo_code_id,
    code: code.code,
    campaign: code.description?.trim() || null,
    forWhat: row.title?.trim() || PROMO_CLAIM_KIND_LABEL[kind],
    claimedAt: row.promo_claimed_at ?? row.created_at ?? "",
    discountPaise: Math.max(0, row.discount_paise ?? 0),
    state,
  };
}

export type PromoClaimFilter = {
  query: string;
  codeId: string;
  kind: PromoClaimKind | "all";
  state: PromoClaimState | "all";
  /** yyyy-mm-dd, inclusive, compared on the clinic-day key the caller passes. */
  from: string;
  to: string;
};

/** The claims a filter keeps, newest first. `dayKey` turns a timestamp into
 *  the clinic's yyyy-mm-dd (formatDateTime's istDateKey in the app). */
export function filterPromoClaims(
  claims: PromoClaim[],
  f: PromoClaimFilter,
  dayKey: (iso: string) => string
): PromoClaim[] {
  const q = f.query.trim().toLowerCase();
  return claims
    .filter((c) => (f.codeId ? c.codeId === f.codeId : true))
    .filter((c) => (f.kind === "all" ? true : c.kind === f.kind))
    .filter((c) => (f.state === "all" ? true : c.state === f.state))
    .filter((c) => {
      if (!f.from && !f.to) return true;
      const day = c.claimedAt ? dayKey(c.claimedAt) : "";
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      return true;
    })
    .filter((c) =>
      q
        ? [c.patientName, c.patientCode ?? "", c.code, c.campaign ?? "", c.forWhat].some((s) => s.toLowerCase().includes(q))
        : true
    )
    .sort((a, b) => (a.claimedAt < b.claimedAt ? 1 : a.claimedAt > b.claimedAt ? -1 : 0));
}
