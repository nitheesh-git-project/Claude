// What the clinic's email switches decide (Settings -> Emails), as pure rules
// so every case is tested without a mail provider or a database.
//
// emailServer.ts asks `decideDelivery()` before every send and writes the
// answer to `email_log`, so a skipped email is still visible on the screen
// with the reason. The switches live in the single-row `email_controls`
// table (schema.sql), read on its own -- not through SITE_SETTINGS_SELECT --
// so a database that has not got the table yet only affects email, and then
// falls back to DEFAULT_EMAIL_CONTROLS, which is how email behaved before
// the switches existed.
//
// The order of the rules is the point:
//   1. A test address (example.test, example.com, .invalid ...) never gets
//      mail, whatever the switches say: the automated test accounts use
//      them, and bounces hurt the sending domain's reputation.
//   2. "Send me a test email" ignores the switches (it exists to check the
//      setup while sending is off), but not rule 1.
//   3. Legal emails (complaint and data-request receipts) are a duty with a
//      deadline, so the master switch does not stop them; only their own
//      switch does, and the screen warns before it is turned off. If the
//      switches cannot be read, a legal email is sent and anything else is
//      skipped -- "we couldn't check" is never read as "allowed" for the rest.
//   4. A kind switched off is skipped; with the master switch off every
//      non-legal email is skipped.
//   5. Test mode sends everything to one inbox instead, naming the real
//      recipient in the subject.

export type EmailKind = "legal" | "booking" | "cancellation" | "reminder" | "test";

export type EmailKindInfo = {
  key: EmailKind;
  label: string;
  description: string;
  /** A duty the master switch does not stop (rule 3). */
  legal: boolean;
  /** Whether the screen offers a switch for it. */
  switchable: boolean;
};

export const EMAIL_KINDS: readonly EmailKindInfo[] = [
  {
    key: "legal",
    label: "Complaints and data requests",
    description:
      "The receipt and the outcome of a complaint, a data download or an account deletion. The law expects a reply within set times, so the main switch does not stop these.",
    legal: true,
    switchable: true,
  },
  {
    key: "booking",
    label: "Booking confirmations",
    description:
      "To the patient when a session is booked: what was booked, when, with whom, and what was paid. Sent once per session.",
    legal: false,
    switchable: true,
  },
  {
    key: "cancellation",
    label: "Cancellations and refunds",
    description: "To the patient when a booked session is cancelled, by them or by the clinic, saying whether money is coming back.",
    legal: false,
    switchable: true,
  },
  {
    key: "reminder",
    label: "Session reminders",
    description: "To the patient the day before a confirmed session and again about an hour before it.",
    legal: false,
    switchable: true,
  },
  {
    key: "test",
    label: "Test email",
    description: "The email the \"Send me a test email\" button sends to you.",
    legal: false,
    switchable: false,
  },
];

const KIND_BY_KEY = new Map(EMAIL_KINDS.map((k) => [k.key, k]));

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && KIND_BY_KEY.has(value as EmailKind);
}

export function emailKindInfo(kind: EmailKind): EmailKindInfo {
  return KIND_BY_KEY.get(kind)!;
}

export type EmailControls = {
  /** The master switch. Off: nothing but legal emails and the test button. */
  sendingEnabled: boolean;
  /** Test mode: when set, every email goes here instead. */
  testInbox: string | null;
  /** Kinds switched off one by one. */
  disabledKinds: EmailKind[];
};

/** How email behaved before the switches existed: on, no test inbox. */
export const DEFAULT_EMAIL_CONTROLS: EmailControls = { sendingEnabled: true, testInbox: null, disabledKinds: [] };

export type EmailControlsRead = { status: "ok"; controls: EmailControls } | { status: "unreadable" };

export type EmailSkipReason =
  | "test_address"
  | "switched_off"
  | "kind_off"
  | "controls_unreadable"
  | "not_configured"
  | "bad_address";

export type DeliveryDecision =
  | { action: "send"; to: string; subjectPrefix: string | null; redirected: boolean }
  | { action: "skip"; reason: EmailSkipReason };

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const EMAIL_MAX = 254;

/** A plausible single address (the provider does the real check). */
export function isPlausibleEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= EMAIL_MAX && EMAIL_SHAPE.test(value.trim());
}

// Reserved for documentation and testing (RFC 2606 / 6761): mail to them
// never reaches a person.
const TEST_TLDS = ["test", "invalid", "localhost", "example", "local"];
const TEST_DOMAINS = ["example.com", "example.net", "example.org"];

/** Whether an address is one of the never-deliverable test kind (rule 1). */
export function isTestAddress(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  const domain = address.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (TEST_TLDS.includes(tld)) return true;
  return TEST_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function decideDelivery(input: { kind: EmailKind; to: string; controls: EmailControlsRead }): DeliveryDecision {
  const to = input.to.trim();
  if (!isPlausibleEmail(to)) return { action: "skip", reason: "bad_address" };
  if (isTestAddress(to)) return { action: "skip", reason: "test_address" };
  const info = emailKindInfo(input.kind);
  if (input.kind === "test") return { action: "send", to, subjectPrefix: null, redirected: false };

  if (input.controls.status === "unreadable") {
    return info.legal ? { action: "send", to, subjectPrefix: null, redirected: false } : { action: "skip", reason: "controls_unreadable" };
  }
  const { controls } = input.controls;
  if (controls.disabledKinds.includes(input.kind)) return { action: "skip", reason: "kind_off" };
  if (!controls.sendingEnabled && !info.legal) return { action: "skip", reason: "switched_off" };

  const inbox = controls.testInbox?.trim() || null;
  if (inbox && isPlausibleEmail(inbox) && !isTestAddress(inbox) && inbox.toLowerCase() !== to.toLowerCase()) {
    return { action: "send", to: inbox, subjectPrefix: `[Test, for ${to}]`, redirected: true };
  }
  return { action: "send", to, subjectPrefix: null, redirected: false };
}

/** What the log keeps of an address: enough to recognise it, not the whole
 *  thing ("as***@gmail.com"). */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = address.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${address.slice(at).toLowerCase()}`.slice(0, EMAIL_MAX);
}

/** The single row as the database holds it. */
export type EmailControlsRow = {
  sending_enabled?: boolean | null;
  test_inbox?: string | null;
  disabled_kinds?: unknown;
};

export function parseEmailControls(row: EmailControlsRow | null | undefined): EmailControls {
  if (!row) return DEFAULT_EMAIL_CONTROLS;
  const kinds = Array.isArray(row.disabled_kinds) ? row.disabled_kinds.filter(isEmailKind) : [];
  return {
    sendingEnabled: typeof row.sending_enabled === "boolean" ? row.sending_enabled : DEFAULT_EMAIL_CONTROLS.sendingEnabled,
    testInbox: isPlausibleEmail(row.test_inbox) ? row.test_inbox.trim() : null,
    disabledKinds: [...new Set(kinds)].filter((k) => emailKindInfo(k).switchable),
  };
}

/** One change from the Settings screen: exactly one of the three. */
export type EmailControlsChange =
  | { field: "sending_enabled"; value: boolean }
  | { field: "test_inbox"; value: string | null }
  | { field: "kind"; kind: EmailKind; enabled: boolean };

export function parseEmailControlsChange(
  body: Record<string, unknown>
): { ok: true; change: EmailControlsChange } | { ok: false; error: string } {
  const keys = ["sendingEnabled", "testInbox", "kind"].filter((k) => k in body);
  if (keys.length !== 1) return { ok: false, error: "Change one setting at a time." };
  if ("sendingEnabled" in body) {
    if (typeof body.sendingEnabled !== "boolean") return { ok: false, error: "Say whether emails are sent." };
    return { ok: true, change: { field: "sending_enabled", value: body.sendingEnabled } };
  }
  if ("testInbox" in body) {
    const raw = body.testInbox;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) return { ok: true, change: { field: "test_inbox", value: null } };
    if (!isPlausibleEmail(raw)) return { ok: false, error: "Enter one email address for test mode, like you@gmail.com." };
    if (isTestAddress(raw)) return { ok: false, error: "That is a test address that never receives mail. Use a real inbox you can open." };
    return { ok: true, change: { field: "test_inbox", value: raw.trim() } };
  }
  if (!isEmailKind(body.kind) || !emailKindInfo(body.kind).switchable) return { ok: false, error: "That kind of email has no switch." };
  if (typeof body.enabled !== "boolean") return { ok: false, error: "Say whether this kind of email is sent." };
  return { ok: true, change: { field: "kind", kind: body.kind, enabled: body.enabled } };
}

/** The new disabled list after a kind's switch moves. */
export function applyKindSwitch(disabled: readonly EmailKind[], kind: EmailKind, enabled: boolean): EmailKind[] {
  const next = disabled.filter((k) => k !== kind);
  return enabled ? next : [...next, kind];
}

export const EMAIL_SKIP_TEXT: Record<EmailSkipReason, string> = {
  test_address: "Test address - never sent",
  switched_off: "Emails are switched off",
  kind_off: "This kind is switched off",
  controls_unreadable: "Couldn't check the switches",
  not_configured: "Email isn't set up on this server",
  bad_address: "Not a valid address",
};
