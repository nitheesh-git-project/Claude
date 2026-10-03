// The "Say hello" form behind the developer credit in the footer, and the
// screen that reads what it collects. Dependency-free apart from the phone
// check, so the whole rule set can be tested without rendering anything.

import { isValidStoredPhone } from "@/lib/phoneNumber";

export const DEV_REACHOUT_STATUSES = ["new", "contacted"] as const;
export type DevReachoutStatus = (typeof DEV_REACHOUT_STATUSES)[number];

export const MAX_DEV_REACHOUT_NAME_LENGTH = 120;
export const MAX_DEV_REACHOUT_EMAIL_LENGTH = 254;
export const MAX_DEV_REACHOUT_MESSAGE_LENGTH = 2000;
/** The same ceiling as the column's own CHECK, so the database is never the
 *  first thing to refuse a note. */
export const MAX_DEV_REACHOUT_NOTE_LENGTH = 2000;

/**
 * One shape of "looks like an email", shared by the admin setting that
 * publishes an address and the public form that collects one. Deliberately
 * loose: the only real test of an address is mailing it.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DevReachoutInput = {
  name: string;
  email: string;
  phone: string | null;
  message: string;
};

export type DevReachoutResult =
  | { ok: true; spam: false; value: DevReachoutInput }
  | { ok: true; spam: true }
  | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Checks what a visitor sent. Every field is trimmed first, so a field of
 * spaces is a missing field rather than a one-character name.
 *
 * `website` is the honeypot: a real visitor never sees it, so a filled one is
 * a script. It is reported as `spam` rather than as an error, because a bot
 * told it failed simply tries again with something else -- the route answers
 * it exactly as it answers a success and writes nothing.
 *
 * The error sentences describe what is needed, not what the visitor did wrong.
 */
export function validateDevReachout(input: unknown): DevReachoutResult {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  if (text(body.website) !== "") return { ok: true, spam: true };

  const name = text(body.name);
  if (!name) return { ok: false, error: "Please tell me your name." };
  if (name.length > MAX_DEV_REACHOUT_NAME_LENGTH) {
    return {
      ok: false,
      error: `Please keep your name to ${MAX_DEV_REACHOUT_NAME_LENGTH} characters or fewer.`,
    };
  }

  const email = text(body.email);
  if (!email) return { ok: false, error: "Please share an email address I can reply to." };
  if (email.length > MAX_DEV_REACHOUT_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter an email address I can reply to." };
  }

  // Optional, but one that is given has to be usable.
  const phone = text(body.phone);
  if (phone && !isValidStoredPhone(phone)) {
    return { ok: false, error: "Please enter a valid contact number, or leave it blank." };
  }

  const message = text(body.message);
  if (!message) return { ok: false, error: "Please write a few words for me to read." };
  if (message.length > MAX_DEV_REACHOUT_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Please keep your message to ${MAX_DEV_REACHOUT_MESSAGE_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, spam: false, value: { name, email, phone: phone || null, message } };
}

/** "Priya Nair" -> "Priya", for the success line. Falls back to "there" so the
 *  sentence never reads "Thanks, ." */
export function firstName(fullName: string): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

export function isDevReachoutStatus(value: unknown): value is DevReachoutStatus {
  return (
    typeof value === "string" && (DEV_REACHOUT_STATUSES as readonly string[]).includes(value)
  );
}

export type DevContact = { enabled: boolean; email: string };

/**
 * The two switches behind the developer credit, read from whatever the
 * settings select returned. An unreadable row -- the columns not applied yet,
 * a failed read -- is "we could not check", and the answer to that is the
 * default (on, no address) rather than refusing the page: a read that failed
 * is not an admin having switched the feature off.
 */
export function devContactFromRow(
  row: { dev_contact_enabled?: boolean | null; dev_contact_email?: string | null } | null | undefined
): DevContact {
  return {
    enabled: typeof row?.dev_contact_enabled === "boolean" ? row.dev_contact_enabled : true,
    // Blank hides the "Prefer email?" row; nothing is ever substituted.
    email:
      typeof row?.dev_contact_email === "string" && EMAIL_RE.test(row.dev_contact_email.trim())
        ? row.dev_contact_email.trim()
        : "",
  };
}
