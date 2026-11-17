// What the clinic's WhatsApp switches decide (Settings -> WhatsApp), as pure
// rules, tested without Meta or a database. The same shape as the email rules
// (emailControls.ts), with two differences that matter:
//
//   - It starts OFF. Email was already running when its switches arrived;
//     WhatsApp has never sent anything, and needs the clinic's own Meta
//     Business account, an approved sender number and approved templates
//     before it can. So nothing is sent until an admin switches it on.
//   - A person must have said yes. Business-started WhatsApp messages need
//     the person's opt-in (Meta's policy, and DPDP consent for a new
//     purpose); the latest row in `whatsapp_consents` is the answer, and no
//     row means no.
//
// The order of the rules:
//   1. A test account (one whose email is a test address -- the QA accounts)
//      is never messaged, and nor is a number that will not parse.
//   2. No consent, or consent withdrawn (including a STOP reply): skipped.
//   3. The switches unreadable: skipped (there is no "legal" WhatsApp; the
//      email still goes).
//   4. Master switch off, or that kind off: skipped.
//   5. Test mode: sent to the one test number instead.

import type { EmailKind } from "@/lib/emailControls";

/** The kinds WhatsApp can carry: the patient-facing session messages. The
 *  legal receipts and the admin test stay email-only. */
export type WhatsAppKind = Extract<EmailKind, "booking" | "cancellation" | "reminder">;

export const WHATSAPP_KINDS: readonly { key: WhatsAppKind; label: string; description: string }[] = [
  { key: "booking", label: "Booking confirmations", description: "When a session is booked or confirmed." },
  { key: "cancellation", label: "Cancellations and refunds", description: "When a booked session is cancelled." },
  { key: "reminder", label: "Session reminders", description: "The day before, and about an hour before." },
];

export function isWhatsAppKind(value: unknown): value is WhatsAppKind {
  return value === "booking" || value === "cancellation" || value === "reminder";
}

export type WhatsAppControls = {
  sendingEnabled: boolean;
  /** Test mode: every message to this number (digits with country code). */
  testNumber: string | null;
  disabledKinds: WhatsAppKind[];
};

/** Off until somebody switches it on. */
export const DEFAULT_WHATSAPP_CONTROLS: WhatsAppControls = { sendingEnabled: false, testNumber: null, disabledKinds: [] };

export type WhatsAppControlsRead = { status: "ok"; controls: WhatsAppControls } | { status: "unreadable" };

export type WhatsAppSkipReason =
  | "test_account"
  | "bad_number"
  | "no_consent"
  | "controls_unreadable"
  | "switched_off"
  | "kind_off"
  | "not_configured";

export type WhatsAppDecision =
  | { action: "send"; to: string; redirected: boolean }
  | { action: "skip"; reason: WhatsAppSkipReason };

/**
 * A stored phone number ("+91 98765 43210", "9876543210", "+44 7700 900123")
 * as the digits WhatsApp's API takes: country code and number, no "+", no
 * spaces. A bare 10-digit number is read as Indian, as the app always has
 * (phoneNumber.ts, LEGACY_DEFAULT_COUNTRY). Anything else unclear is null.
 */
export function toWhatsAppNumber(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return digits;
  return null;
}

/** What the log keeps of a number: country code and the last three digits. */
export function maskNumber(digits: string): string {
  if (digits.length < 6) return "***";
  return `+${digits.slice(0, digits.length > 10 ? digits.length - 10 : 2)} ***** **${digits.slice(-3)}`;
}

export type ConsentChoice = "granted" | "withdrawn";

/** The person's answer: the latest row wins; none is "no". */
export function hasConsent(rows: readonly { choice: string; created_at: string }[] | null | undefined): boolean {
  if (!rows || rows.length === 0) return false;
  const latest = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0];
  return latest.choice === "granted";
}

export function decideWhatsApp(input: {
  kind: WhatsAppKind;
  phone: string | null | undefined;
  testAccount: boolean;
  consented: boolean;
  controls: WhatsAppControlsRead;
}): WhatsAppDecision {
  if (input.testAccount) return { action: "skip", reason: "test_account" };
  const to = toWhatsAppNumber(input.phone);
  if (!to) return { action: "skip", reason: "bad_number" };
  if (!input.consented) return { action: "skip", reason: "no_consent" };
  if (input.controls.status === "unreadable") return { action: "skip", reason: "controls_unreadable" };
  const { controls } = input.controls;
  if (!controls.sendingEnabled) return { action: "skip", reason: "switched_off" };
  if (controls.disabledKinds.includes(input.kind)) return { action: "skip", reason: "kind_off" };
  const test = toWhatsAppNumber(controls.testNumber ? `+${controls.testNumber.replace(/^\+/, "")}` : null);
  if (test && test !== to) return { action: "send", to: test, redirected: true };
  return { action: "send", to, redirected: false };
}

export type WhatsAppControlsRow = { sending_enabled?: boolean | null; test_number?: string | null; disabled_kinds?: unknown };

export function parseWhatsAppControls(row: WhatsAppControlsRow | null | undefined): WhatsAppControls {
  if (!row) return DEFAULT_WHATSAPP_CONTROLS;
  const kinds = Array.isArray(row.disabled_kinds) ? row.disabled_kinds.filter(isWhatsAppKind) : [];
  const test = typeof row.test_number === "string" ? toWhatsAppNumber(`+${row.test_number.replace(/^\+/, "")}`) : null;
  return {
    sendingEnabled: row.sending_enabled === true,
    testNumber: test,
    disabledKinds: [...new Set(kinds)],
  };
}

export type WhatsAppControlsChange =
  | { field: "sending_enabled"; value: boolean }
  | { field: "test_number"; value: string | null }
  | { field: "kind"; kind: WhatsAppKind; enabled: boolean };

export function parseWhatsAppControlsChange(
  body: Record<string, unknown>
): { ok: true; change: WhatsAppControlsChange } | { ok: false; error: string } {
  const keys = ["sendingEnabled", "testNumber", "kind"].filter((k) => k in body);
  if (keys.length !== 1) return { ok: false, error: "Change one setting at a time." };
  if ("sendingEnabled" in body) {
    if (typeof body.sendingEnabled !== "boolean") return { ok: false, error: "Say whether WhatsApp messages are sent." };
    return { ok: true, change: { field: "sending_enabled", value: body.sendingEnabled } };
  }
  if ("testNumber" in body) {
    const raw = body.testNumber;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) return { ok: true, change: { field: "test_number", value: null } };
    if (typeof raw !== "string") return { ok: false, error: "Enter one mobile number with its country code, like +91 98765 43210." };
    const digits = toWhatsAppNumber(raw.trim().startsWith("+") ? raw : raw);
    if (!digits) return { ok: false, error: "Enter one mobile number with its country code, like +91 98765 43210." };
    return { ok: true, change: { field: "test_number", value: digits } };
  }
  if (!isWhatsAppKind(body.kind)) return { ok: false, error: "That kind of message has no switch." };
  if (typeof body.enabled !== "boolean") return { ok: false, error: "Say whether this kind of message is sent." };
  return { ok: true, change: { field: "kind", kind: body.kind, enabled: body.enabled } };
}

export function applyWhatsAppKindSwitch(disabled: readonly WhatsAppKind[], kind: WhatsAppKind, enabled: boolean): WhatsAppKind[] {
  const next = disabled.filter((k) => k !== kind);
  return enabled ? next : [...next, kind];
}

/** Words a person sends to stop messages (Meta's guidance, plus Hindi). */
const STOP_WORDS = ["stop", "unsubscribe", "stop all", "cancel", "opt out", "optout", "band karo", "बंद"];

export function isStopMessage(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  return STOP_WORDS.includes(t);
}

export const WHATSAPP_SKIP_TEXT: Record<WhatsAppSkipReason, string> = {
  test_account: "Test account - never sent",
  bad_number: "No usable mobile number",
  no_consent: "Patient hasn't said yes to WhatsApp",
  controls_unreadable: "Couldn't check the switches",
  switched_off: "WhatsApp is switched off",
  kind_off: "This kind is switched off",
  not_configured: "WhatsApp isn't set up on this server",
};
