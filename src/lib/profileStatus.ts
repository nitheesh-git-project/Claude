// The status pill on the Health Profile -- Improving, Holding steady, Needs
// attention -- as a rule, not a mood.
//
// It is computed from the profile's main measure only, with the registry's
// own thresholds (changeDirection -> MDC, isMeaningfulChange -> MCID), so the
// pill can never say "Improving" on a change smaller than the measurement
// error. The physiotherapist may override it with a reason; that override is
// data stored beside the profile, and `effectiveStatus` applies it -- except
// that it never hides a red flag or new fall later than the override. Its
// shape and wording live here so every screen reads the same.
//
//   Improving        the main measure has moved the good way by at least its
//                    meaningful change (MCID) since the first review, and
//                    the latest review is not worse than the one before it
//                    by more than the measurement error (MDC).
//   Needs attention  worse than the first review beyond the MDC, or worse
//                    than the previous review beyond the MDC, or a new fall,
//                    or a red flag. A safety signal wins over a good number.
//   Holding steady   within the measurement error either way, or moved but
//                    not by a meaningful amount, or a measure with no
//                    "better" direction.
//   Baseline set     only one review: there is nothing to compare yet.
//
// A check that could not be run is not a check that came back negative:
// no main measure at all is "unknown", which a screen words as "not enough
// to tell yet", not as steady.

import { changeDirection, isMeaningfulChange, type ProfileKind } from "@/lib/outcomeMeasures";

export type ProfileStatus = "improving" | "steady" | "needs_attention" | "baseline" | "unknown";

export const PROFILE_STATUSES: readonly ProfileStatus[] = ["improving", "steady", "needs_attention", "baseline", "unknown"];

export type StatusMeasure = {
  measureKey: string;
  /** Oldest first, one value per review. */
  values: readonly number[];
  profileKind: ProfileKind;
  /** A joint range is judged against its usual range / the other side. */
  normal?: number;
  /** The first and latest readings were taken by different people. */
  differentTester?: boolean;
};

export type StatusInput = {
  main: StatusMeasure | null;
  /** A fall recorded since the previous review. */
  newFall?: boolean;
  /** When that fall happened (the latest, ISO). Lets a status override tell
   *  whether it was made before or after the signal; absent means unknown,
   *  which is treated as "after" (the safe side). */
  newFallAt?: string | null;
  /** A red flag the physiotherapist has raised. */
  redFlag?: boolean;
  /** When the flagged reading was taken (the latest, ISO); absent is unknown. */
  redFlagAt?: string | null;
};

export type StatusReasonCode =
  | "red_flag"
  | "new_fall"
  | "worse_than_first"
  | "worse_than_previous"
  | "better_meaningful"
  | "better_not_meaningful"
  | "within_error"
  | "no_direction"
  | "single_review"
  | "no_measure";

export type StatusResult = {
  status: ProfileStatus;
  reason: StatusReasonCode;
  /** For a safety signal (red flag, new fall) only: when the latest signal
   *  happened. Left out when that is not known. */
  signalAt?: string;
};

const latestIso = (...values: (string | null | undefined)[]): string | null => {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    const t = v ? Date.parse(v) : NaN;
    if (Number.isFinite(t) && t > bestMs) {
      best = v ?? null;
      bestMs = t;
    }
  }
  return best;
};

export function computeProfileStatus(input: StatusInput): StatusResult {
  // Safety signals first, and they need no measure.
  // Both signals count towards `signalAt`: an override has to be newer than
  // the LATEST one to have seen it. A signal with no known time leaves it out.
  const unknownTime = (input.redFlag && !latestIso(input.redFlagAt)) || (input.newFall && !latestIso(input.newFallAt));
  const latest = unknownTime ? null : latestIso(input.redFlag ? input.redFlagAt : null, input.newFall ? input.newFallAt : null);
  const signalAt = latest ? { signalAt: latest } : {};
  if (input.redFlag) return { status: "needs_attention", reason: "red_flag", ...signalAt };
  if (input.newFall) return { status: "needs_attention", reason: "new_fall", ...signalAt };

  const main = input.main;
  const values = main ? main.values.filter((v) => Number.isFinite(v)) : [];
  if (!main || values.length === 0) return { status: "unknown", reason: "no_measure" };
  if (values.length === 1) return { status: "baseline", reason: "single_review" };

  const first = values[0];
  const now = values[values.length - 1];
  const previous = values[values.length - 2];
  const opts = { profileKind: main.profileKind, normal: main.normal, differentTester: main.differentTester };

  const sinceFirst = changeDirection(main.measureKey, first, now, opts);
  if (sinceFirst === null) return { status: "unknown", reason: "no_measure" };
  const sincePrevious = changeDirection(main.measureKey, previous, now, opts);

  if (sinceFirst === "worse") return { status: "needs_attention", reason: "worse_than_first" };
  if (sincePrevious === "worse") return { status: "needs_attention", reason: "worse_than_previous" };

  if (sinceFirst === "better") {
    // Beyond the measurement error is the floor; where the registry knows a
    // meaningful change, the move must reach it too. Unknown (null) does
    // not block: the MDC test above already held.
    if (isMeaningfulChange(main.measureKey, first, now, main.profileKind) === false) {
      return { status: "steady", reason: "better_not_meaningful" };
    }
    return { status: "improving", reason: "better_meaningful" };
  }
  if (sinceFirst === "changed") return { status: "steady", reason: "no_direction" };
  return { status: "steady", reason: "within_error" };
}

// --- Words ------------------------------------------------------------------------------

export type StatusVoice = "patient" | "clinician";

export const PROFILE_STATUS_LABEL: Record<ProfileStatus, string> = {
  improving: "Improving",
  steady: "Holding steady",
  needs_attention: "Needs attention",
  baseline: "Baseline set",
  unknown: "Not enough to tell yet",
};

const REASON_PATIENT: Record<StatusReasonCode, string> = {
  red_flag: "Your physiotherapist has flagged something to look at together.",
  new_fall: "A new fall has been recorded, so your physiotherapist will look at your balance and safety first.",
  worse_than_first: "Your main measure is worse than at the first review.",
  worse_than_previous: "Your main measure slipped since the last review.",
  better_meaningful: "Your main measure has improved by a change that matters.",
  better_not_meaningful: "Your main measure is moving the right way, but not yet by a change that matters.",
  within_error: "Your main measure has not changed by more than the test can tell apart.",
  no_direction: "Your main measure has moved, and it is not a score that goes better or worse.",
  single_review: "This is your first review. The comparison starts at the next one.",
  no_measure: "There is no main measure recorded yet.",
};

const REASON_CLINICIAN: Record<StatusReasonCode, string> = {
  red_flag: "A red flag is raised on this profile.",
  new_fall: "A new fall is recorded since the last review.",
  worse_than_first: "The main measure is worse than the first review by more than the MDC.",
  worse_than_previous: "The main measure is worse than the previous review by more than the MDC.",
  better_meaningful: "The main measure has improved by at least its MCID since the first review.",
  better_not_meaningful: "The main measure has improved beyond the MDC but not by its MCID.",
  within_error: "The change in the main measure is inside the MDC.",
  no_direction: "The main measure has no better direction, so no judgement is made.",
  single_review: "One review on record: nothing to compare yet.",
  no_measure: "No main measure is recorded, so no status is computed.",
};

export function statusReasonText(reason: StatusReasonCode, voice: StatusVoice): string {
  return (voice === "clinician" ? REASON_CLINICIAN : REASON_PATIENT)[reason];
}

// --- The override ---------------------------------------------------------------------------

export const STATUS_OVERRIDE_REASON_MIN = 10;
export const STATUS_OVERRIDE_REASON_MAX = 300;

/** What the physiotherapist stores to overrule the computed pill. Only the
 *  three real states can be chosen; "baseline" and "unknown" are the absence
 *  of a judgement, not a clinical decision. */
export type StatusOverride = {
  status: "improving" | "steady" | "needs_attention";
  reason: string;
  /** When the override was made (ISO). Needed to tell whether a safety signal
   *  came after it; absent means unknown. */
  setAt?: string | null;
};

export function validateStatusOverride(raw: unknown): { ok: true; override: StatusOverride } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Nothing to save." };
  const { status, reason } = raw as Record<string, unknown>;
  if (status !== "improving" && status !== "steady" && status !== "needs_attention") {
    return { ok: false, error: "Choose improving, holding steady or needs attention." };
  }
  const text = typeof reason === "string" ? reason.replace(/\s+/g, " ").trim() : "";
  if (text.length < STATUS_OVERRIDE_REASON_MIN) {
    return { ok: false, error: `Say why you are overruling the computed status (at least ${STATUS_OVERRIDE_REASON_MIN} characters).` };
  }
  if (text.length > STATUS_OVERRIDE_REASON_MAX) {
    return { ok: false, error: `Keep the reason to ${STATUS_OVERRIDE_REASON_MAX} characters or fewer.` };
  }
  return { ok: true, override: { status, reason: text } };
}

/** The status a screen shows: the override when there is one, else the
 *  computed one. `overridden` lets the pill say whose judgement it is.
 *
 *  One exception, on the safe side: an override never hides a safety signal
 *  (a red flag, a new fall) that happened AFTER it was made. The physiotherapist
 *  overruled what they could see then; a later fall is news they have not
 *  weighed. A signal with no known time, or an override with no known time, is
 *  treated as newer -- "we could not tell" is not "it was already seen".
 *  `overrideSuperseded` says so, so the screen can tell the physiotherapist. */
export function effectiveStatus(
  computed: StatusResult,
  override: StatusOverride | null | undefined
): { status: ProfileStatus; overridden: boolean; reasonText?: string; overrideSuperseded?: boolean } {
  if (!override) return { status: computed.status, overridden: false };
  const isSafetySignal = computed.status === "needs_attention" && (computed.reason === "red_flag" || computed.reason === "new_fall");
  if (isSafetySignal && override.status !== "needs_attention" && signalIsNewer(computed.signalAt, override.setAt)) {
    return { status: computed.status, overridden: false, overrideSuperseded: true };
  }
  return { status: override.status, overridden: true, reasonText: override.reason };
}

/** Whether a safety signal happened after the override was made. */
export function signalIsNewer(signalAt: string | null | undefined, overrideSetAt: string | null | undefined): boolean {
  const signal = signalAt ? Date.parse(signalAt) : NaN;
  const set = overrideSetAt ? Date.parse(overrideSetAt) : NaN;
  if (!Number.isFinite(signal) || !Number.isFinite(set)) return true;
  return signal > set;
}
