// Deleting a person whose account has records behind it.
//
// A hard delete is refused for an account with payments, payouts, sessions or
// clinical records (src/lib/accountDeletion.ts), because the books are built
// on those rows. What an admin usually wants then is the *person* gone, not
// the books: the login removed and the contact details cleared, while every
// money row stays exactly as it was, under the name it was written against,
// marked "Deleted user". The reason is required, and is what the (i) beside
// that mark shows later.
//
// Dependency-free: the reasons, the validation and the money summary the
// confirmation shows are all tested without a database.

export const DELETE_REASONS = [
  { key: "duplicate", label: "Duplicate account" },
  { key: "user_request", label: "The person asked to be removed" },
  { key: "fraud", label: "Fraud or abuse" },
  { key: "left_clinic", label: "Left the clinic" },
  { key: "test_account", label: "Test account" },
  { key: "other", label: "Other (say why)" },
] as const;

export type DeleteReason = (typeof DELETE_REASONS)[number]["key"];

export const DELETE_NOTE_MAX = 1000;

export function deleteReasonLabel(reason: string | null | undefined): string {
  return DELETE_REASONS.find((r) => r.key === reason)?.label.replace(" (say why)", "") ?? "Not recorded";
}

/** The reason and note as the server will store them, or what is wrong. */
export function validateDeleteReason(
  reason: unknown,
  note: unknown
): { ok: true; reason: DeleteReason; note: string | null } | { ok: false; error: string } {
  const key = typeof reason === "string" ? reason.trim() : "";
  if (!DELETE_REASONS.some((r) => r.key === key)) {
    return { ok: false, error: "Choose why this account is being deleted." };
  }
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > DELETE_NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${DELETE_NOTE_MAX} characters.` };
  }
  if (key === "other" && text.length < 3) {
    return { ok: false, error: "Say why in the note when the reason is Other." };
  }
  return { ok: true, reason: key as DeleteReason, note: text || null };
}

/** The address the login is moved to, so the real one is free to sign up
 *  again and never matches this profile. `.invalid` is reserved (RFC 2606). */
export function placeholderEmail(userId: string): string {
  return `deleted.${userId.replace(/-/g, "").slice(0, 12)}@deleted.invalid`;
}

// ---------------------------------------------------------------------------
// What the confirmation lists
// ---------------------------------------------------------------------------

export type MoneyRecordKind =
  | "payment"
  | "pay_later"
  | "programme"
  | "home_visit_package"
  | "refund"
  | "payout"
  | "payout_request"
  | "settlement";

export type MoneyRecord = {
  kind: MoneyRecordKind;
  /** "Payment", "Payout", ... */
  label: string;
  amountPaise: number;
  status: string | null;
  at: string | null;
  /** A Razorpay ID or a programme code, when there is one. */
  reference: string | null;
};

export const MONEY_KIND_LABEL: Record<MoneyRecordKind, string> = {
  payment: "Payment",
  pay_later: "Pay-later payment",
  programme: "Programme",
  home_visit_package: "Home-visit package",
  refund: "Refund",
  payout: "Payout to therapist",
  payout_request: "Payout request",
  settlement: "Session earnings",
};

export type MoneySummary = {
  records: MoneyRecord[];
  /** Per kind: how many and how much, in the order the confirmation lists them. */
  byKind: { kind: MoneyRecordKind; label: string; count: number; amountPaise: number }[];
  count: number;
};

const KIND_ORDER: MoneyRecordKind[] = [
  "payment",
  "pay_later",
  "programme",
  "home_visit_package",
  "refund",
  "settlement",
  "payout",
  "payout_request",
];

export function summariseMoneyRecords(records: MoneyRecord[]): MoneySummary {
  const sorted = [...records].sort((a, b) => {
    const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (k !== 0) return k;
    return (b.at ?? "").localeCompare(a.at ?? "");
  });
  const byKind: MoneySummary["byKind"] = [];
  for (const kind of KIND_ORDER) {
    const of = sorted.filter((r) => r.kind === kind);
    if (of.length === 0) continue;
    byKind.push({
      kind,
      label: MONEY_KIND_LABEL[kind],
      count: of.length,
      amountPaise: of.reduce((sum, r) => sum + (Number.isFinite(r.amountPaise) ? Math.round(r.amountPaise) : 0), 0),
    });
  }
  return { records: sorted, byKind, count: sorted.length };
}

/** What the account_deletions row keeps of the summary: counts and totals,
 *  not every row (the rows themselves stay in their own tables). */
export function recordsSnapshot(summary: MoneySummary, otherCounts: Record<string, number>) {
  return {
    money: summary.byKind.map((k) => ({ kind: k.kind, count: k.count, amountPaise: k.amountPaise })),
    other: otherCounts,
  };
}

export type AccountDeletionInfo = {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  reason: string;
  note: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name?: string | null;
  records?: { money?: { kind: MoneyRecordKind; count: number; amountPaise: number }[] } | null;
};

export const ACCOUNT_DELETION_SELECT =
  "user_id, role, full_name, email, phone, reason, note, deleted_at, deleted_by, records";
