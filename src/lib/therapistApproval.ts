/**
 * What approving a therapist carries besides the `approved` flag.
 *
 * Approve used to be one tap that flipped `approved` and nothing else, so the
 * revenue share -- the number a therapist's pay is worked out from -- was a
 * second visit to the profile that was easy to forget. `therapistReadiness`
 * then flagged the gap after the fact, and until somebody noticed, the
 * automatic assigner skipped the therapist and a session an admin assigned by
 * hand paid them nothing. So the approval dialog asks for the share up front
 * and the route writes it in the same update as `approved`.
 *
 * Two rules, both enforced here so the route and the dialog cannot disagree:
 *
 * 1. **The share is required from an admin who can set it.** Approving is a
 *   `people` capability and setting a rate is `money`; an admin with both
 *   must give the share, so a therapist approved by them is never left
 *   without one.
 * 2. **An admin without `money` still approves, and sends no share.** The
 *   people desk vets credentials; holding that up for finance would leave a
 *   qualified clinician unable to sign in. The share stays unset, the
 *   readiness panel keeps saying so, and the automatic assigner keeps
 *   refusing them until finance sets it. A share sent by such an admin is
 *   refused rather than silently dropped -- the caller believed it saved.
 *
 * The home-visit share is optional: null means "no separate rate, use the
 * ordinary one", the same meaning the profile's own form gives a blank.
 */

export const APPROVAL_NOTE_MAX_LENGTH = 500;

export type TherapistApprovalSetupInput = {
  revenueSharePercent?: unknown;
  homeVisitSharePercent?: unknown;
  visibleOnTeam?: unknown;
  note?: unknown;
};

export type TherapistApprovalSetup = {
  /** Null only when the approving admin cannot set money. */
  revenueSharePercent: number | null;
  /** Null means the ordinary share applies to home visits too. */
  homeVisitSharePercent: number | null;
  /** Undefined leaves the column's current value alone. */
  visibleOnTeam: boolean | undefined;
  note: string | null;
};

export type TherapistApprovalResult =
  | { ok: true; setup: TherapistApprovalSetup }
  | { ok: false; code: "revenue_share_required" | "invalid" | "forbidden_money"; error: string };

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

/** A 0-100 percentage with at most two decimals (the column is numeric(5,2)). */
export function parseSharePercent(value: unknown): number | null {
  if (isBlank(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  if (Math.round(n * 100) !== n * 100) return null;
  return n;
}

export function parseTherapistApprovalSetup(
  input: TherapistApprovalSetupInput | null | undefined,
  { canSetRevenueShare }: { canSetRevenueShare: boolean }
): TherapistApprovalResult {
  const body = input ?? {};
  const shareSent = !isBlank(body.revenueSharePercent);
  const homeShareSent = !isBlank(body.homeVisitSharePercent);

  if (!canSetRevenueShare && (shareSent || homeShareSent)) {
    return {
      ok: false,
      code: "forbidden_money",
      error: "Your access can't set a revenue share. Approve without it and ask a finance admin to set it.",
    };
  }

  let revenueSharePercent: number | null = null;
  let homeVisitSharePercent: number | null = null;
  if (canSetRevenueShare) {
    if (!shareSent) {
      return {
        ok: false,
        code: "revenue_share_required",
        error: "Set the therapist's revenue share before approving - their pay is worked out from it.",
      };
    }
    revenueSharePercent = parseSharePercent(body.revenueSharePercent);
    if (revenueSharePercent === null) {
      return { ok: false, code: "invalid", error: "Revenue share must be a number between 0 and 100." };
    }
    if (homeShareSent) {
      homeVisitSharePercent = parseSharePercent(body.homeVisitSharePercent);
      if (homeVisitSharePercent === null) {
        return { ok: false, code: "invalid", error: "Home-visit share must be a number between 0 and 100." };
      }
    }
  }

  if (body.visibleOnTeam !== undefined && typeof body.visibleOnTeam !== "boolean") {
    return { ok: false, code: "invalid", error: "visibleOnTeam must be true or false." };
  }

  let note: string | null = null;
  if (!isBlank(body.note)) {
    if (typeof body.note !== "string") {
      return { ok: false, code: "invalid", error: "The note must be text." };
    }
    note = body.note.trim();
    if (note.length > APPROVAL_NOTE_MAX_LENGTH) {
      return {
        ok: false,
        code: "invalid",
        error: `Keep the note under ${APPROVAL_NOTE_MAX_LENGTH} characters.`,
      };
    }
  }

  return {
    ok: true,
    setup: {
      revenueSharePercent,
      homeVisitSharePercent,
      visibleOnTeam: body.visibleOnTeam as boolean | undefined,
      note,
    },
  };
}
