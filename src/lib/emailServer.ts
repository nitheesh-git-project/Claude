import type { Email } from "@/lib/legalEmails";

// Sends one email through Resend's HTTP API (https://resend.com), server
// only. Switched on by two variables: RESEND_API_KEY (secret) and
// EMAIL_FROM (e.g. "MoveRestore Physiotherapy <hello@moverestorephysio.com>",
// on a domain verified in Resend). Unset means "skipped", logged once per
// call -- the workflows that call this never depend on an email landing:
// every case is on People -> Data requests either way.
//
// Never throws, and gives up after EMAIL_TIMEOUT_MS so a slow provider never
// holds up the person's request.

const EMAIL_TIMEOUT_MS = 8000;

export type EmailResult = "sent" | "skipped" | "failed";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();
}

export async function sendEmail(to: string, email: Email, options: { replyTo?: string | null } = {}): Promise<EmailResult> {
  if (!emailConfigured()) {
    console.warn(`Email not configured (RESEND_API_KEY / EMAIL_FROM); skipped "${email.subject}"`);
    return "skipped";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`Email "${email.subject}" refused by Resend: ${res.status}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(`Email "${email.subject}" could not be sent`, e instanceof Error ? e.message : e);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
