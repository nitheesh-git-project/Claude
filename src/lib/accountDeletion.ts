// Whether an account can be deleted, and what to say when it cannot.
//
// The answer is nearly always "it cannot", and that is a property of the
// database rather than a policy anybody chose: thirty-five tables carry a
// foreign key to `profiles(id)` with no ON DELETE behaviour -- appointments,
// payments, payouts, care plan versions, the audit log, the clinical record
// -- so Postgres refuses outright (23503) for any account that has ever done
// anything. Deleting one "properly" would mean deleting their money and
// their clinical history with them, which is not a tidier account list, it
// is a hole in the books.
//
// So the feature is narrow on purpose and it is the useful half: an account
// with **no history at all** -- the typo'd email, the duplicate, the one
// created against the wrong person -- goes, and everything else is refused
// with the reason named and the real alternative beside it. Suspending is
// what an admin usually wants anyway: the login stops working and the record
// of what they did stays attributable, which is the whole reason
// `profiles.active` exists.
//
// Dependency-free, so the wording and the arithmetic are unit-tested rather
// than discovered against a live clinic. Same shape as categoryDeletion.ts,
// deliberately -- one way to refuse a delete in this codebase.

/**
 * What still points at the account, grouped the way a person would describe
 * it rather than one entry per foreign key. Fifty columns across thirty-five
 * tables is a true list and an unreadable one; "3 sessions and 12 back-office
 * actions" is what an admin can act on.
 */
export type AccountReferences = {
  /** Appointments they booked, ran, cancelled, were asked for, or took cash for. */
  sessions: number;
  /** Payments, payout batches and costs carrying their id. */
  money: number;
  /** Programmes and home-visit packages bought by or locked to them. */
  programmes: number;
  /** Health profile, Pain Map exams, session notes, care plan versions. */
  clinical: number;
  /** Audit rows they wrote, and windows somebody signed in as them. */
  backOffice: number;
  /** Referrals they sent, were assigned or became. */
  referrals: number;
};

export const NO_ACCOUNT_REFERENCES: AccountReferences = {
  sessions: 0,
  money: 0,
  programmes: 0,
  clinical: 0,
  backOffice: 0,
  referrals: 0,
};

export function countAccountReferences(refs: AccountReferences): number {
  return (
    refs.sessions +
    refs.money +
    refs.programmes +
    refs.clinical +
    refs.backOffice +
    refs.referrals
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The refusal, or null when nothing is in the way.
 *
 * Names what is actually holding it, counted, for the reason the category
 * version does: an admin who has cancelled every session and still cannot
 * delete the account needs to know it is the audit rows, or they will keep
 * trying. And it names the alternative, because suspending is what they
 * wanted -- a login that stops working, with the history intact.
 */
export function describeAccountBlockers(
  refs: AccountReferences,
  name: string
): { message: string; total: number } | null {
  const parts: string[] = [];
  if (refs.sessions > 0) parts.push(plural(refs.sessions, "session", "sessions"));
  if (refs.money > 0) parts.push(plural(refs.money, "money record", "money records"));
  if (refs.programmes > 0) parts.push(plural(refs.programmes, "programme", "programmes"));
  if (refs.clinical > 0) {
    parts.push(plural(refs.clinical, "clinical record", "clinical records"));
  }
  if (refs.backOffice > 0) {
    parts.push(plural(refs.backOffice, "back-office action", "back-office actions"));
  }
  if (refs.referrals > 0) parts.push(plural(refs.referrals, "referral", "referrals"));

  if (parts.length === 0) return null;

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return {
    message: `${name} has ${list} on file, so this account cannot be deleted — removing it would take that history with it, and the books and the audit trail are built on it. Suspend instead: they can no longer sign in, and everything they did stays attributable to them.`,
    total: countAccountReferences(refs),
  };
}

/** Refused before anything is counted. Each of these is a rule about who may
 *  be deleted at all, rather than about what they have done. */
export const CANNOT_DELETE_SELF =
  "You can't delete your own account. Ask another Master Admin to do it.";

export const CANNOT_DELETE_LAST_ADMIN =
  "This is the last Master Admin who can still sign in. Deleting it would leave nobody able to widen anyone's access again.";

/** What the route says when the delete ran and removed nothing, with no
 *  blocker to explain it. Two different situations and an admin can act on
 *  each -- unlike a silent success covering both. */
export const ACCOUNT_ALREADY_GONE =
  "That account has already been deleted. Refresh to see the current list.";

export const ACCOUNT_DELETE_REFUSED =
  "The database refused to delete that account and did not say why. Nothing has changed — something still points at it that this screen did not count. Suspend the account instead.";
