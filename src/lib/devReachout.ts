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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What /api/admin/dev-reachout-note was asked to do, once the body checks
 *  out. A note is kept trimmed; an empty one is refused rather than stored,
 *  because removing a note is its own action. */
export type DevReachoutNoteRequest =
  | { action: "add"; reachoutId: string; body: string }
  | { action: "edit"; noteId: string; body: string }
  | { action: "delete"; noteId: string };

export function parseDevReachoutNoteRequest(
  input: Record<string, unknown>
): { ok: true; value: DevReachoutNoteRequest } | { ok: false; error: string } {
  const { action } = input;
  if (action !== "add" && action !== "edit" && action !== "delete") {
    return { ok: false, error: "Unknown action" };
  }
  const idKey = action === "add" ? "reachoutId" : "noteId";
  const id = input[idKey];
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return { ok: false, error: `Missing or invalid ${idKey}` };
  }
  if (action === "delete") return { ok: true, value: { action, noteId: id } };

  if (typeof input.body !== "string") return { ok: false, error: "The note must be text." };
  const body = input.body.trim();
  if (body === "") return { ok: false, error: "Write something before saving the note." };
  if (body.length > MAX_DEV_REACHOUT_NOTE_LENGTH) {
    return {
      ok: false,
      error: `Please keep a note to ${MAX_DEV_REACHOUT_NOTE_LENGTH} characters or fewer.`,
    };
  }
  return {
    ok: true,
    value: action === "add" ? { action, reachoutId: id, body } : { action, noteId: id, body },
  };
}

/** One note as the dashboard reads it. PostgREST embeds the author as an
 *  object or, depending on how it reads the foreign key, a one-row array. */
export type DevReachoutNoteRow = {
  id: string;
  reachout_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author: { full_name: string | null } | { full_name: string | null }[] | null;
};

/** One note as the screen draws it. `authorName` is null when the author's
 *  account is gone, or the note was carried over from the single-note era. */
export type DevReachoutNote = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  authorName: string | null;
};

/** Notes grouped by message, oldest first within each. `null` in, `null`
 *  out: a read that failed is "could not load", never an empty thread. */
export function groupDevReachoutNotes(
  rows: DevReachoutNoteRow[] | null
): Map<string, DevReachoutNote[]> | null {
  if (!rows) return null;
  const byReachout = new Map<string, DevReachoutNote[]>();
  for (const row of rows) {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    const note: DevReachoutNote = {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      authorName: author?.full_name?.trim() || null,
    };
    const list = byReachout.get(row.reachout_id);
    if (list) list.push(note);
    else byReachout.set(row.reachout_id, [note]);
  }
  for (const list of byReachout.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  return byReachout;
}
