// The emails the legal workflows send: a receipt when someone files a
// complaint or asks for their account to be deleted, an alert to the
// Grievance Officer, and a closing note when the case is done. Pure: each
// function returns { subject, text, html } and src/lib/emailServer.ts sends
// it. Every value that came from a person is escaped before it reaches HTML.

import {
  DELETION_DEADLINE_DAYS,
  GRIEVANCE_ACK_HOURS,
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_RESOLVE_DAYS,
  type GrievanceCategory,
} from "@/lib/dataRequests";

export type Email = { subject: string; text: string; html: string };

export type EmailBrand = { siteName: string; siteUrl: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One branded, mobile-friendly layout for every email: a teal header with
 *  the clinic's name, a white card, a quiet footer. Inline styles only --
 *  email clients ignore stylesheets. */
export function layout(brand: EmailBrand, heading: string, paragraphs: string[], footnote?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${p}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0b3b37;padding:20px 28px;color:#5eead4;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(brand.siteName)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a">${heading}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">${footnote ?? `You are receiving this because of a request made on ${escapeHtml(brand.siteUrl)}.`}</td></tr>
</table></td></tr></table></body></html>`;
}

function ref(reference: string): string {
  return `<strong style="font-family:Menlo,Consolas,monospace;color:#0f172a">${escapeHtml(reference)}</strong>`;
}

// --- to the person ---------------------------------------------------------

export function grievanceReceivedEmail(brand: EmailBrand, g: { name: string; reference: string; category: GrievanceCategory }): Email {
  const subject = `We have your complaint (${g.reference})`;
  const text =
    `Hello ${g.name},\n\nThank you for telling us. Your complaint about "${GRIEVANCE_CATEGORY_LABELS[g.category]}" has reference ${g.reference}.\n\n` +
    `We will acknowledge it within ${GRIEVANCE_ACK_HOURS} hours and aim to resolve it within ${GRIEVANCE_RESOLVE_DAYS} days. Reply to this email if you want to add anything.\n\n${brand.siteName}`;
  const html = layout(brand, "We have your complaint", [
    `Hello ${escapeHtml(g.name)},`,
    `Thank you for telling us. Your complaint about <em>${escapeHtml(GRIEVANCE_CATEGORY_LABELS[g.category])}</em> has reference ${ref(g.reference)}.`,
    `We will acknowledge it within <strong>${GRIEVANCE_ACK_HOURS} hours</strong> and aim to resolve it within <strong>${GRIEVANCE_RESOLVE_DAYS} days</strong>. Reply to this email if you want to add anything.`,
  ]);
  return { subject, text, html };
}

export function grievanceAcknowledgedEmail(brand: EmailBrand, g: { name: string; reference: string }): Email {
  const subject = `We're looking into your complaint (${g.reference})`;
  const text =
    `Hello ${g.name},\n\nOur Grievance Officer is now looking into your complaint ${g.reference}. We aim to resolve it within ${GRIEVANCE_RESOLVE_DAYS} days of when you sent it, and will write to you when we have.\n\n${brand.siteName}`;
  const html = layout(brand, "We're looking into it", [
    `Hello ${escapeHtml(g.name)},`,
    `Our Grievance Officer is now looking into your complaint ${ref(g.reference)}. We aim to resolve it within <strong>${GRIEVANCE_RESOLVE_DAYS} days</strong> of when you sent it, and will write to you when we have.`,
  ]);
  return { subject, text, html };
}

export function grievanceResolvedEmail(brand: EmailBrand, g: { name: string; reference: string; resolution: string }): Email {
  const subject = `Your complaint is resolved (${g.reference})`;
  const text =
    `Hello ${g.name},\n\nWe have closed your complaint ${g.reference}. What we did:\n\n${g.resolution}\n\n` +
    `If you are not satisfied, reply to this email. You can also contact the National Consumer Helpline on 1915, or, for a complaint about your personal data, the Data Protection Board of India.\n\n${brand.siteName}`;
  const html = layout(brand, "Your complaint is resolved", [
    `Hello ${escapeHtml(g.name)},`,
    `We have closed your complaint ${ref(g.reference)}. What we did:`,
    `<span style="display:block;padding:12px 14px;border-radius:10px;background:#f0fdfa;color:#0b3b37;white-space:pre-line">${escapeHtml(g.resolution)}</span>`,
    `If you are not satisfied, reply to this email. You can also contact the National Consumer Helpline on <strong>1915</strong>, or, for a complaint about your personal data, the Data Protection Board of India.`,
  ]);
  return { subject, text, html };
}

export function deletionRequestedEmail(brand: EmailBrand, d: { name: string; reference: string }): Email {
  const subject = `We have your request to delete your account (${d.reference})`;
  const text =
    `Hello ${d.name},\n\nWe have your request ${d.reference} to delete your ${brand.siteName} account. We will complete it within ${DELETION_DEADLINE_DAYS} days and email you when it is done.\n\n` +
    `Changed your mind? You can take the request back from your profile (Your data) until our team starts on it.\n\n${brand.siteName}`;
  const html = layout(brand, "We have your deletion request", [
    `Hello ${escapeHtml(d.name)},`,
    `We have your request ${ref(d.reference)} to delete your account. We will complete it within <strong>${DELETION_DEADLINE_DAYS} days</strong> and email you when it is done.`,
    `Changed your mind? You can take the request back from your profile, under <em>Your data</em>, until our team starts on it.`,
  ]);
  return { subject, text, html };
}

export function deletionCompletedEmail(brand: EmailBrand, d: { name: string; reference: string }): Email {
  const subject = `Your account has been deleted (${d.reference})`;
  const text =
    `Hello ${d.name},\n\nAs you asked (${d.reference}), your ${brand.siteName} account is deleted: you can no longer sign in, and your name, email and phone number have been removed. ` +
    `Records the law requires us to keep, such as clinical and payment records, are kept for the required period, marked as a closed account.\n\nThis is the last email we will send you.\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "Your account has been deleted",
    [
      `Hello ${escapeHtml(d.name)},`,
      `As you asked (${ref(d.reference)}), your account is deleted: you can no longer sign in, and your name, email and phone number have been removed.`,
      `Records the law requires us to keep, such as clinical and payment records, are kept for the required period, marked as a closed account.`,
    ],
    "This is the last email we will send you."
  );
  return { subject, text, html };
}

export function deletionDeclinedEmail(brand: EmailBrand, d: { name: string; reference: string; reason: string }): Email {
  const subject = `About your deletion request (${d.reference})`;
  const text =
    `Hello ${d.name},\n\nWe could not complete your request ${d.reference} to delete your account, for this reason:\n\n${d.reason}\n\n` +
    `Reply to this email and we will help. You can also complain to the Data Protection Board of India.\n\n${brand.siteName}`;
  const html = layout(brand, "About your deletion request", [
    `Hello ${escapeHtml(d.name)},`,
    `We could not complete your request ${ref(d.reference)} to delete your account, for this reason:`,
    `<span style="display:block;padding:12px 14px;border-radius:10px;background:#fffbeb;color:#78350f;white-space:pre-line">${escapeHtml(d.reason)}</span>`,
    `Reply to this email and we will help. You can also complain to the Data Protection Board of India.`,
  ]);
  return { subject, text, html };
}

// --- to the Grievance Officer -------------------------------------------

export function officerAlertEmail(
  brand: EmailBrand,
  a:
    | { kind: "grievance"; reference: string; name: string; email: string; category: GrievanceCategory; message: string }
    | { kind: "deletion"; reference: string; name: string; email: string; role: string; reason: string | null }
): Email {
  const queue = `${brand.siteUrl.replace(/\/$/, "")}/admin/dashboard?section=people&tab=data-requests`;
  if (a.kind === "grievance") {
    const subject = `New complaint ${a.reference}: acknowledge within ${GRIEVANCE_ACK_HOURS} hours`;
    const text =
      `New complaint ${a.reference} from ${a.name} <${a.email}> about "${GRIEVANCE_CATEGORY_LABELS[a.category]}".\n\n${a.message}\n\n` +
      `Acknowledge within ${GRIEVANCE_ACK_HOURS} hours, resolve within ${GRIEVANCE_RESOLVE_DAYS} days: ${queue}`;
    const html = layout(brand, `New complaint ${ref(a.reference)}`, [
      `From <strong>${escapeHtml(a.name)}</strong> &lt;${escapeHtml(a.email)}&gt;, about <em>${escapeHtml(GRIEVANCE_CATEGORY_LABELS[a.category])}</em>.`,
      `<span style="display:block;padding:12px 14px;border-radius:10px;background:#f8fafc;white-space:pre-line">${escapeHtml(a.message)}</span>`,
      `Acknowledge within <strong>${GRIEVANCE_ACK_HOURS} hours</strong>, resolve within <strong>${GRIEVANCE_RESOLVE_DAYS} days</strong>.`,
      `<a href="${escapeHtml(queue)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600">Open Data requests</a>`,
    ], "Sent to the Grievance Officer.");
    return { subject, text, html };
  }
  const subject = `Account deletion request ${a.reference}: due within ${DELETION_DEADLINE_DAYS} days`;
  const text =
    `${a.name} <${a.email}> (${a.role}) asked for their account to be deleted (${a.reference}).` +
    `${a.reason ? `\n\nReason: ${a.reason}` : ""}\n\nComplete within ${DELETION_DEADLINE_DAYS} days: ${queue}`;
  const html = layout(brand, `Deletion request ${ref(a.reference)}`, [
    `<strong>${escapeHtml(a.name)}</strong> &lt;${escapeHtml(a.email)}&gt; (${escapeHtml(a.role)}) asked for their account to be deleted.`,
    ...(a.reason ? [`Reason: <em>${escapeHtml(a.reason)}</em>`] : []),
    `Complete within <strong>${DELETION_DEADLINE_DAYS} days</strong>.`,
    `<a href="${escapeHtml(queue)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600">Open Data requests</a>`,
  ], "Sent to the Grievance Officer.");
  return { subject, text, html };
}

// --- Settings -> Emails ------------------------------------------------------

/** "Send me a test email": proves the sender, the domain and the inbox work,
 *  in the same layout as every real email. Carries no personal data. */
export function testEmail(brand: EmailBrand): Email {
  const subject = `Test email from ${brand.siteName}`;
  const text =
    `This is a test from Settings -> Emails on ${brand.siteUrl}.\n\n` +
    `If you can read this, the clinic's emails are reaching this inbox. Check it did not land in spam.\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "Your emails are working",
    [
      `This is a test from <strong>Settings &rarr; Emails</strong> on ${escapeHtml(brand.siteUrl)}.`,
      "If you can read this, the clinic's emails are reaching this inbox. Check it did not land in spam.",
    ],
    "You are receiving this because you pressed \"Send me a test email\"."
  );
  return { subject, text, html };
}
