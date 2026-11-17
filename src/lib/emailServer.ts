import "server-only";
import type { Email } from "@/lib/legalEmails";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decideDelivery,
  maskEmail,
  parseEmailControls,
  type EmailControlsRead,
  type EmailKind,
  type EmailSkipReason,
} from "@/lib/emailControls";

// Sends one email through Resend's HTTP API (https://resend.com), server
// only. Switched on by two variables: RESEND_API_KEY (secret) and
// EMAIL_FROM (e.g. "MoveRestore Physiotherapy <hello@moverestorephysio.com>",
// on a domain verified in Resend). Unset means "skipped" -- the workflows
// that call this never depend on an email landing: every case is on People
// -> Data requests either way.
//
// Before sending it asks the clinic's switches (Settings -> Emails,
// `email_controls`; rules in emailControls.ts): a test address is never
// mailed, the master switch and each kind's switch can stop an email, and
// test mode sends it to one inbox instead. Every attempt -- sent, skipped
// or failed, with the reason -- is written to `email_log` for the screen.
//
// Never throws, and gives up after EMAIL_TIMEOUT_MS so a slow provider never
// holds up the person's request. A failed log write is ignored: the email
// matters, the log line does not.

const EMAIL_TIMEOUT_MS = 8000;

export type EmailResult = "sent" | "skipped" | "failed";
export type EmailOutcome = { result: EmailResult; reason: EmailSkipReason | null; redirected: boolean };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** The switches, or "unreadable". A database without the table is the
 *  honest default (nobody can have switched anything there). */
export async function loadEmailControls(admin: AdminClient): Promise<EmailControlsRead> {
  try {
    const { data, error } = await admin.from("email_controls").select("sending_enabled, test_inbox, disabled_kinds").eq("id", 1).maybeSingle();
    if (error?.code === "42P01" || error?.code === "PGRST205") return { status: "ok", controls: parseEmailControls(null) };
    if (error) return { status: "unreadable" };
    return { status: "ok", controls: parseEmailControls(data) };
  } catch {
    return { status: "unreadable" };
  }
}

async function logAttempt(
  admin: AdminClient | null,
  row: { kind: EmailKind; to: string; subject: string; status: EmailResult; reason: EmailSkipReason | null; redirected: boolean }
) {
  if (!admin) return;
  try {
    await admin.from("email_log").insert({
      kind: row.kind,
      recipient: maskEmail(row.to),
      subject: row.subject.slice(0, 300),
      status: row.status,
      reason: row.reason,
      redirected: row.redirected,
    });
  } catch {
    // The log is for the screen; never let it fail the send.
  }
}

function adminClientOrNull(): AdminClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Sends (or deliberately does not send) one email, and says which and why. */
export async function deliverEmail(
  to: string,
  email: Email,
  options: { kind: EmailKind; replyTo?: string | null }
): Promise<EmailOutcome> {
  const admin = adminClientOrNull();
  const controls: EmailControlsRead = admin ? await loadEmailControls(admin) : { status: "unreadable" };
  const decision = decideDelivery({ kind: options.kind, to, controls });
  const base = { kind: options.kind, to, subject: email.subject };

  if (decision.action === "skip") {
    await logAttempt(admin, { ...base, status: "skipped", reason: decision.reason, redirected: false });
    return { result: "skipped", reason: decision.reason, redirected: false };
  }
  const subject = decision.subjectPrefix ? `${decision.subjectPrefix} ${email.subject}` : email.subject;
  if (!emailConfigured()) {
    console.warn(`Email not configured (RESEND_API_KEY / EMAIL_FROM); skipped "${email.subject}"`);
    await logAttempt(admin, { ...base, to: decision.to, subject, status: "skipped", reason: "not_configured", redirected: decision.redirected });
    return { result: "skipped", reason: "not_configured", redirected: decision.redirected };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  let result: EmailResult = "failed";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [decision.to],
        subject,
        text: email.text,
        html: email.html,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    if (res.ok) result = "sent";
    else console.error(`Email "${email.subject}" refused by Resend: ${res.status}`);
  } catch (e) {
    console.error(`Email "${email.subject}" could not be sent`, e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
  await logAttempt(admin, { ...base, to: decision.to, subject, status: result, reason: null, redirected: decision.redirected });
  return { result, reason: null, redirected: decision.redirected };
}

/** The callers' shape: just the result. */
export async function sendEmail(
  to: string,
  email: Email,
  options: { kind: EmailKind; replyTo?: string | null }
): Promise<EmailResult> {
  return (await deliverEmail(to, email, options)).result;
}
