// What a person agreed to, and when: the Terms of use and Privacy policy at
// signup (or on their next sign-in, for accounts that predate the tick box or
// were made by staff), the telehealth consent on each booking, and a parent's
// or guardian's confirmation when a booking is for someone under 18.
//
// Every agreement is one row in `policy_acceptances` (schema.sql), append-only
// by trigger. The time is the database's, never the browser's. Dependency-free
// so the rules are unit-tested without a browser or a database.

import { LEGAL_FACTS } from "@/lib/legal/legalFacts";

export const POLICY_DOCUMENTS = ["terms_privacy", "telehealth_consent", "guardian_consent"] as const;
export type PolicyDocument = (typeof POLICY_DOCUMENTS)[number];

export const POLICY_CONTEXTS = ["signup", "reaccept", "booking"] as const;
export type PolicyContext = (typeof POLICY_CONTEXTS)[number];

/**
 * The version a person agrees to: the legal pages' "Last updated" date.
 * Bumping `effectiveDate` in legalFacts.ts after a change of substance is
 * what asks every signed-in person to agree again.
 */
export function currentTermsVersion(effectiveDate: string = LEGAL_FACTS.effectiveDate): string {
  return effectiveDate.trim();
}

/** The signup metadata key the database trigger reads. */
export const ACCEPTED_TERMS_METADATA_KEY = "accepted_terms_version";

/** The signup metadata a form adds once its tick box is ticked. */
export function signupTermsMetadata(version: string = currentTermsVersion()): Record<string, string> {
  return { [ACCEPTED_TERMS_METADATA_KEY]: version };
}

const VERSION = /^[0-9a-z.-]{1,32}$/i;

export function isValidPolicyVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value);
}

/**
 * Whether the dashboards must stop and ask. `latest` is the newest
 * terms_privacy version on file for the person, `null` when they have none,
 * and `undefined` when the read failed -- which is "could not check", never
 * "has not agreed": the gate stays open rather than locking a person out of
 * their care over a database blink.
 */
export function needsTermsAcceptance(
  latest: string | null | undefined,
  current: string = currentTermsVersion()
): boolean {
  if (latest === undefined) return false;
  return latest !== current;
}

/** The newest version among a person's terms_privacy rows. */
export function latestTermsVersion(
  rows: { document: string; version: string; accepted_at: string }[]
): string | null {
  let best: { version: string; at: string } | null = null;
  for (const r of rows) {
    if (r.document !== "terms_privacy") continue;
    if (!best || r.accepted_at > best.at) best = { version: r.version, at: r.accepted_at };
  }
  return best?.version ?? null;
}

export const POLICY_DOCUMENT_LABELS: Record<PolicyDocument, string> = {
  terms_privacy: "Terms of use and Privacy policy",
  telehealth_consent: "Telehealth consent",
  guardian_consent: "Parent or guardian consent",
};

export const POLICY_CONTEXT_LABELS: Record<PolicyContext, string> = {
  signup: "At signup",
  reaccept: "On sign-in",
  booking: "On a booking",
};

/** The age below which a booking needs a parent or guardian to confirm. */
export const ADULT_AGE = 18;

export function isMinor(age: number | null | undefined): boolean {
  return typeof age === "number" && Number.isFinite(age) && age < ADULT_AGE;
}
