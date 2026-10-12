// Finding a person from a reference that is not on their card: a Razorpay
// payment id (pay_...), a Razorpay order id (order_...), a session code
// (SS0004) or a programme purchase code (SP0001). This is what an admin has
// in hand when a patient forwards a bank SMS, or Razorpay's dashboard shows a
// payment, and the question is "whose is this?".
//
// Dependency-free so it is tested without rendering. The directory's own
// name/email/ID search stays where it is; this only answers the hidden
// references and says which one matched, so the card can show *why* it is in
// the results instead of leaving the admin to wonder.

export type SearchRefKind = "payment" | "order" | "session" | "programme";

export type SearchRef = { kind: SearchRefKind; value: string };

export const SEARCH_REF_LABEL: Record<SearchRefKind, string> = {
  payment: "Payment",
  order: "Order",
  session: "Session",
  programme: "Programme",
};

// Below this, a reference match is noise: "pa" would match every payment id
// on the platform and "s" every session code. Name and email search keep
// matching from the first character, as before.
export const MIN_REF_QUERY_LENGTH = 4;

// Pasted ids arrive with a stray space or a trailing newline from an SMS or
// a spreadsheet cell, and razorpay ids are case-sensitive only on their side.
export function normalizeRefQuery(query: string): string {
  return query.replace(/\s+/g, "").toLowerCase();
}

/** The first reference the query matches, or null. Exact matches win over
 *  partial ones, so pasting SS0004 points at SS0004 rather than SS00041. */
export function matchSearchRef(
  refs: readonly SearchRef[] | undefined,
  query: string,
): SearchRef | null {
  if (!refs || refs.length === 0) return null;
  const q = normalizeRefQuery(query);
  if (q.length < MIN_REF_QUERY_LENGTH) return null;
  let partial: SearchRef | null = null;
  for (const ref of refs) {
    const value = ref.value.toLowerCase();
    if (value === q) return ref;
    if (!partial && value.includes(q)) partial = ref;
  }
  return partial;
}

type RefSource = {
  patientId: string | null | undefined;
  kind: SearchRefKind;
  value: string | null | undefined;
};

/** Groups references by patient, dropping blanks and duplicates (a payment
 *  id appears on both the payments ledger and the row it paid for). */
export function groupSearchRefs(sources: Iterable<RefSource>): Map<string, SearchRef[]> {
  const byPatient = new Map<string, SearchRef[]>();
  const seen = new Set<string>();
  for (const s of sources) {
    const value = s.value?.trim();
    if (!s.patientId || !value) continue;
    const key = `${s.patientId}|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byPatient.get(s.patientId);
    if (list) list.push({ kind: s.kind, value });
    else byPatient.set(s.patientId, [{ kind: s.kind, value }]);
  }
  return byPatient;
}
