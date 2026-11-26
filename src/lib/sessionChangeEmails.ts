// The emails sent when a session changes after it was booked, beyond the
// patient's own booking emails (bookingEmails.ts):
//
// - to the patient when their session moves to a new time (their own move,
//   or the new time they chose because nobody could be confirmed in time);
// - to the physiotherapist who was on a session that was moved or
//   cancelled, so nobody turns up to a session that no longer exists;
// - to the clinic's inbox when a patient takes the refund or a new time
//   because no physiotherapist was confirmed in time -- the clinic missed
//   its side and should know about it the moment it happens.
//
// The same rule as every email here: no condition, concern or notes, and
// no patient name in a staff email -- the session reference finds it on a
// signed-in screen. Pure, every typed value escaped, unit-tested.

import { escapeHtml, layout, type Email, type EmailBrand } from "@/lib/legalEmails";
import type { SessionMode } from "@/lib/bookingEmails";

const MODE_TEXT: Record<SessionMode, string> = { online: "video session", home_visit: "home visit" };

function button(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escapeHtml(label)}</a>`;
}

/** Why the session moved, as the patient is told it. */
export type MoveReason = "patient" | "no_therapist";

export type SessionMovedFacts = {
  name: string;
  /** Both already formatted in the clinic's zone. */
  oldWhen: string;
  newWhen: string;
  mode: SessionMode;
  reason: MoveReason;
  dashboardUrl: string;
};

export function sessionMovedEmail(brand: EmailBrand, f: SessionMovedFacts): Email {
  const subject = `Moved: your ${MODE_TEXT[f.mode]} is now ${f.newWhen}`;
  const why =
    f.reason === "no_therapist"
      ? "We're sorry we couldn't confirm a physiotherapist in time for your original booking."
      : null;
  const next = "We'll email you again as soon as your physiotherapist is confirmed for the new time.";
  const text =
    `Hello ${f.name},\n\n` +
    (why ? `${why}\n\n` : "") +
    `Your ${MODE_TEXT[f.mode]} on ${f.oldWhen} has moved to ${f.newWhen}.\n\n${next}\n\n` +
    `Your dashboard: ${f.dashboardUrl}\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "Your session has moved",
    [
      `Hello ${escapeHtml(f.name)},`,
      ...(why ? [escapeHtml(why)] : []),
      `Your ${MODE_TEXT[f.mode]} on ${escapeHtml(f.oldWhen)} has moved to <strong>${escapeHtml(f.newWhen)}</strong>.`,
      escapeHtml(next),
      button(f.dashboardUrl, "Open your dashboard"),
    ],
    "You are receiving this because you booked a session. Your health details are never sent by email; they stay on your dashboard."
  );
  return { subject, text, html };
}

export type TherapistReleasedFacts = {
  name: string;
  sessionRef: string;
  when: string;
  mode: SessionMode;
  change: "moved" | "cancelled";
  dashboardUrl: string;
};

/** To the physiotherapist who was on it: you are no longer on this session. */
export function therapistSessionReleasedEmail(brand: EmailBrand, f: TherapistReleasedFacts): Email {
  const verb = f.change === "moved" ? "was moved to a new time by the patient" : "has been cancelled";
  const subject = `${f.change === "moved" ? "Moved" : "Cancelled"}: session ${f.sessionRef} on ${f.when}`;
  const after =
    f.change === "moved"
      ? "You're no longer on it. The clinic confirms who takes the new time, and you'll hear if it's you."
      : "Nothing further is needed from you. The time is free again on your schedule.";
  const text =
    `Hello ${f.name},\n\nSession ${f.sessionRef} (${MODE_TEXT[f.mode]}) on ${f.when} ${verb}.\n\n${after}\n\n` +
    `Your schedule: ${f.dashboardUrl}\n\n${brand.siteName}`;
  const html = layout(
    brand,
    f.change === "moved" ? "A session of yours has moved" : "A session of yours is cancelled",
    [
      `Hello ${escapeHtml(f.name)},`,
      `Session <strong>${escapeHtml(f.sessionRef)}</strong> (${MODE_TEXT[f.mode]}) on <strong>${escapeHtml(f.when)}</strong> ${verb}.`,
      escapeHtml(after),
      button(f.dashboardUrl, "Open your schedule"),
    ],
    "Sent to the physiotherapist assigned to this session. Patient details stay on the signed-in dashboard."
  );
  return { subject, text, html };
}

export type ClinicAlertFacts = {
  sessionRef: string;
  when: string;
  mode: SessionMode;
  action: "refunded" | "moved";
  /** The new time, for a move. */
  newWhen: string | null;
  adminUrl: string;
};

/** To the clinic's inbox: a patient took the way out because nobody was confirmed in time. */
export function clinicNoTherapistAlertEmail(brand: EmailBrand, f: ClinicAlertFacts): Email {
  const did =
    f.action === "refunded"
      ? "cancelled it and was refunded in full"
      : `moved it to ${f.newWhen ?? "a new time"}, which now needs a physiotherapist`;
  const subject = `No physiotherapist in time: ${f.sessionRef} ${f.action === "refunded" ? "refunded" : "moved"}`;
  const text =
    `Session ${f.sessionRef} (${MODE_TEXT[f.mode]}) on ${f.when} had no physiotherapist confirmed close to its start, ` +
    `so the patient was offered a refund or a new time. They ${did}.\n\n` +
    `Open it in the admin dashboard: ${f.adminUrl}\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "A session had no physiotherapist in time",
    [
      `Session <strong>${escapeHtml(f.sessionRef)}</strong> (${MODE_TEXT[f.mode]}) on <strong>${escapeHtml(f.when)}</strong> had no physiotherapist confirmed close to its start, so the patient was offered a refund or a new time.`,
      `They ${escapeHtml(did)}.`,
      button(f.adminUrl, "Open in admin"),
    ],
    "Sent to the clinic's contact address set in Settings."
  );
  return { subject, text, html };
}
