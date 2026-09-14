// An admin signing in as somebody else, and the rules around it.
//
// This is a real session swap, not a read-only mirror: the browser genuinely
// becomes the patient (or therapist, or hospital) so every screen renders
// from their own data and every control works. It is the fastest way to
// answer "the app is broken for me" -- and it is the single most dangerous
// capability in this codebase, because an action taken during a swap is
// written as that user. There is no column on appointments, or anywhere
// else, that can say an admin was at the keyboard.
//
// So the safety is entirely in the gates, and they are deliberately in a
// dependency-free module where they can be unit-tested rather than only
// exercised by clicking:
//
//   * Master Admin only. Not a section scope -- `requireAdminScope("people")`
//     would hand this to whoever can edit a phone number, and this is not
//     that kind of capability.
//   * Never another admin. Impersonating a colleague is how one admin uses
//     another's authority, and it has no support value: an admin having
//     trouble can be asked what they see.
//   * A real reason, ten characters, the same floor as an admin credit
//     adjustment. "test" tells a later reader nothing about why somebody
//     opened a patient's health record.
//   * It expires. A forgotten tab is an open window into that record, so the
//     window is short and the proxy signs the session out when it passes.

/** How long a swap lasts before the proxy ends it. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

/** The marker cookie. Read by the proxy (to expire it), by the dashboard
 *  shells (to draw the banner) and by the exit route. httpOnly: nothing in
 *  the browser needs to read it, and a script that could would be reading a
 *  claim about who you are. */
export const IMPERSONATION_COOKIE = "dpp_impersonation";

/** Where the admin's own session is parked while the swap is on, so Exit
 *  puts them back rather than asking them to sign in again. */
export const ADMIN_RESTORE_COOKIE = "dpp_admin_restore";

export const IMPERSONATION_REASON_MIN = 10;

export type ImpersonatableRole = "patient" | "therapist" | "hospital";

export const IMPERSONATABLE_ROLES: ImpersonatableRole[] = [
  "patient",
  "therapist",
  "hospital",
];

/** What the marker cookie carries. Small on purpose -- everything else about
 *  the swap is a row in admin_impersonation_sessions, which the admin cannot
 *  rewrite; a cookie is a claim the browser holds. */
export type ImpersonationMarker = {
  /** admin_impersonation_sessions.id, so the exit route can close the row. */
  sessionId: string;
  adminId: string;
  targetId: string;
  targetRole: ImpersonatableRole;
  targetName: string;
  /** Epoch ms. */
  expiresAt: number;
};

export function isImpersonatableRole(role: unknown): role is ImpersonatableRole {
  return (
    typeof role === "string" &&
    (IMPERSONATABLE_ROLES as string[]).includes(role)
  );
}

export type StartRefusal =
  | "not_master_admin"
  | "no_reason"
  | "target_missing"
  | "target_is_admin"
  | "target_inactive"
  | "target_is_self";

export const START_REFUSAL_MESSAGE: Record<StartRefusal, string> = {
  not_master_admin: "Only a Master Admin can open somebody else's dashboard.",
  no_reason: `Say why you need to see this dashboard - at least ${IMPERSONATION_REASON_MIN} characters.`,
  target_missing: "That account no longer exists.",
  target_is_admin:
    "You cannot sign in as another admin. Ask them what they are seeing instead.",
  target_inactive:
    "That account is suspended. Restore it first if you need to see their dashboard.",
  target_is_self: "You are already signed in as yourself.",
};

export type StartCandidate = {
  adminId: string;
  adminScope: string;
  reason: string;
  target: {
    id: string;
    role: string | null;
    active: boolean | null;
  } | null;
};

/**
 * Whether this swap may begin. Returns null when it may.
 *
 * Ordered so the answer names the most useful problem: an admin without the
 * scope is told that before anything about the target, since nothing they
 * change about the request will help.
 */
export function refuseImpersonation(candidate: StartCandidate): StartRefusal | null {
  if (candidate.adminScope !== "full") return "not_master_admin";
  if (candidate.reason.trim().length < IMPERSONATION_REASON_MIN) return "no_reason";
  if (!candidate.target) return "target_missing";
  if (candidate.target.id === candidate.adminId) return "target_is_self";
  // Checked before `active`, because "you cannot sign in as another admin" is
  // the rule, and a suspended admin is still an admin.
  if (candidate.target.role === "admin") return "target_is_admin";
  if (!isImpersonatableRole(candidate.target.role)) return "target_missing";
  if (candidate.target.active === false) return "target_inactive";
  return null;
}

/** Past its window. Checked by the proxy on every dashboard request rather
 *  than trusted to the cookie's own max-age: the Supabase session cookies
 *  outlive our marker, so an expiry the browser enforces alone would drop
 *  the banner and leave the swap running underneath it. */
export function isExpired(marker: ImpersonationMarker, nowMs: number): boolean {
  return nowMs >= marker.expiresAt;
}

export function minutesLeft(marker: ImpersonationMarker, nowMs: number): number {
  return Math.max(0, Math.ceil((marker.expiresAt - nowMs) / 60_000));
}

/** Parses the marker cookie. Anything malformed is treated as no marker at
 *  all -- a half-read marker must never be interpreted as "not impersonating"
 *  by one reader and "impersonating" by another, and the safe direction for
 *  an unreadable claim is to end the swap. */
export function parseMarker(raw: string | undefined): ImpersonationMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationMarker>;
    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.adminId !== "string" ||
      typeof parsed.targetId !== "string" ||
      typeof parsed.targetName !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !isImpersonatableRole(parsed.targetRole)
    ) {
      return null;
    }
    return parsed as ImpersonationMarker;
  } catch {
    return null;
  }
}

/** Where a swap lands. The dashboard each role actually has -- never
 *  `/dashboard`, which resolves by role and would work, but leaves the admin
 *  guessing whether the redirect took. */
export function dashboardPathFor(role: ImpersonatableRole): string {
  return `/${role}/dashboard`;
}
