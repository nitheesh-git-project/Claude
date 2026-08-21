// The notification feed every dashboard shows, derived rather than stored.
//
// The admin already had a real audit trail (admin_activity_log); patients,
// therapists and hospitals had nothing, so each dashboard invented its own
// "recent" list with different wording and ordering. This module turns the
// rows those pages already query into one shape, so all four dashboards
// render the same feed component and a person moving between roles reads
// the same vocabulary.
//
// Deriving instead of writing a notifications table is deliberate: every
// event here is already a row somewhere (an appointment's status, a
// payout, a change request), and a second copy would be one more thing to
// keep in sync -- and there is no cron in this deployment to write it.
// The cost is that "read/unread" doesn't exist; `needsYou` marks what is
// still waiting on the viewer instead, which is the question a person
// actually opens a dashboard to answer.

export type FeedTone = "neutral" | "info" | "good" | "warn" | "bad";

export type FeedItem = {
  id: string;
  /** ISO timestamp; the feed sorts on this, newest first. */
  at: string;
  icon: string;
  tone: FeedTone;
  title: string;
  detail?: string;
  href?: string;
  /** True when the viewer still has to do something about it. Drives the
   *  "N need you" count above the feed. */
  needsYou?: boolean;
};

export function sortFeed(items: FeedItem[], limit = 12): FeedItem[] {
  return [...items]
    .filter((i) => !!i.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

export function countNeedsYou(items: FeedItem[]): number {
  return items.filter((i) => i.needsYou).length;
}

// ---------------------------------------------------------------------------
// Row shapes. Each page maps its own query rows into these before calling a
// builder, so this module never has to know a table's full column list.

export type FeedAppointment = {
  id: string;
  slot_time: string | null;
  status: string;
  visit_mode?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  therapist_name?: string | null;
  patient_name?: string | null;
  session_code?: string | null;
};

export type FeedRequest = {
  id: string;
  status: string;
  created_at: string;
  admin_notes?: string | null;
  label?: string;
};

export type FeedPayout = {
  id: string;
  status: string;
  amount_paise: number;
  created_at: string;
  paid_at?: string | null;
};

export type FeedReferral = {
  id: string;
  status: string;
  created_at: string;
  patient_name?: string | null;
};

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/** A patient's own feed: their sessions, their intake submissions, their
 *  package purchases. */
export function buildPatientFeed({
  appointments,
  conditionRequests,
}: {
  appointments: FeedAppointment[];
  conditionRequests: FeedRequest[];
}): FeedItem[] {
  const items: FeedItem[] = [];

  for (const a of appointments) {
    const when = a.slot_time ?? a.created_at ?? "";
    const mode = a.visit_mode === "home_visit" ? "Home visit" : "Video session";
    if (a.status === "requested") {
      items.push({
        id: `appt-${a.id}`,
        at: a.created_at ?? when,
        icon: "fa-hourglass-half",
        tone: "warn",
        title: `${mode} waiting for a therapist`,
        detail: "The clinic is assigning someone — you'll see the joining details here once it's confirmed.",
        href: "/patient/dashboard/sessions",
      });
    } else if (a.status === "confirmed") {
      items.push({
        id: `appt-${a.id}`,
        at: when,
        icon: "fa-circle-check",
        tone: "good",
        title: `${mode} confirmed${a.therapist_name ? ` with ${a.therapist_name}` : ""}`,
        detail: when ? new Date(when).toLocaleString() : undefined,
        href: "/patient/dashboard/sessions",
      });
    } else if (a.status === "cancelled") {
      items.push({
        id: `appt-${a.id}`,
        at: when,
        icon: "fa-circle-xmark",
        tone: "bad",
        title: `${mode} cancelled`,
        detail: "Any refund due follows the cancellation window.",
        href: "/patient/dashboard/sessions",
      });
    }
    if (a.payment_status === "unpaid" && a.status !== "cancelled") {
      items.push({
        id: `pay-${a.id}`,
        at: a.created_at ?? when,
        icon: "fa-indian-rupee-sign",
        tone: "warn",
        title: "Payment not completed",
        detail: "This session isn't booked until payment goes through.",
        href: "/patient/dashboard/sessions",
        needsYou: true,
      });
    }
  }

  for (const r of conditionRequests) {
    if (r.status === "pending") {
      items.push({
        id: `cond-${r.id}`,
        at: r.created_at,
        icon: "fa-file-waveform",
        tone: "info",
        title: "Health profile sent for review",
        detail: "Your therapist sees the previous answers until the clinic approves this one.",
        href: "/patient/dashboard/health-profile",
      });
    } else if (r.status === "declined") {
      items.push({
        id: `cond-${r.id}`,
        at: r.created_at,
        icon: "fa-rotate-left",
        tone: "warn",
        title: "Health profile came back with a note",
        detail: r.admin_notes ?? "Open the questions again to fix it and resend.",
        href: "/patient/dashboard/health-profile",
        needsYou: true,
      });
    } else if (r.status === "approved") {
      items.push({
        id: `cond-${r.id}`,
        at: r.created_at,
        icon: "fa-circle-check",
        tone: "good",
        title: "Health profile approved",
        detail: "Your therapist can now read your answers.",
        href: "/patient/dashboard/health-profile",
      });
    }
  }

  return sortFeed(items);
}

/** A therapist's feed: what was assigned to them, what they still have to
 *  record, and what they were paid. */
export function buildTherapistFeed({
  appointments,
  payouts,
  accessGrants,
}: {
  appointments: FeedAppointment[];
  payouts: FeedPayout[];
  accessGrants: FeedRequest[];
}): FeedItem[] {
  const items: FeedItem[] = [];
  const now = Date.now();

  for (const a of appointments) {
    const when = a.slot_time ?? a.created_at ?? "";
    const mode = a.visit_mode === "home_visit" ? "Home visit" : "Video session";
    if (a.status === "confirmed") {
      const upcoming = when ? new Date(when).getTime() > now : false;
      items.push({
        id: `appt-${a.id}`,
        at: when,
        icon: upcoming ? "fa-calendar-check" : "fa-clipboard-check",
        tone: upcoming ? "good" : "warn",
        title: upcoming
          ? `${mode} booked${a.patient_name ? ` with ${a.patient_name}` : ""}`
          : `${mode} finished — mark it complete`,
        detail: when ? new Date(when).toLocaleString() : undefined,
        href: "/therapist/dashboard/sessions",
        needsYou: !upcoming,
      });
    }
    if (a.status === "completed") {
      items.push({
        id: `appt-done-${a.id}`,
        at: when,
        icon: "fa-circle-check",
        tone: "good",
        title: `${mode} completed${a.patient_name ? ` — ${a.patient_name}` : ""}`,
        href: "/therapist/dashboard/sessions",
      });
    }
  }

  for (const p of payouts) {
    items.push({
      id: `payout-${p.id}`,
      at: p.paid_at ?? p.created_at,
      icon: "fa-money-bill-transfer",
      tone: p.status === "paid" ? "good" : "info",
      title: p.status === "paid" ? `Payout of ${money(p.amount_paise)} sent` : `Payout of ${money(p.amount_paise)} pending`,
      href: "/therapist/dashboard/earnings",
    });
  }

  for (const g of accessGrants) {
    if (g.status === "requested") {
      items.push({
        id: `grant-${g.id}`,
        at: g.created_at,
        icon: "fa-key",
        tone: "info",
        title: `Edit access requested${g.label ? ` for ${g.label}` : ""}`,
        detail: "Waiting on the clinic to approve it. You can already read this patient's record.",
        href: "/therapist/dashboard/health-profile",
      });
    } else if (g.status === "approved") {
      items.push({
        id: `grant-${g.id}`,
        at: g.created_at,
        icon: "fa-unlock",
        tone: "good",
        title: `Edit access approved${g.label ? ` for ${g.label}` : ""}`,
        href: "/therapist/dashboard/health-profile",
      });
    }
  }

  return sortFeed(items);
}

/** A hospital's feed: the referrals they sent and what happened to them. */
export function buildHospitalFeed({ referrals }: { referrals: FeedReferral[] }): FeedItem[] {
  return sortFeed(
    referrals.map((r) => {
      const tone: FeedTone =
        r.status === "accepted" ? "good" : r.status === "rejected" ? "bad" : r.status === "withdrawn" ? "neutral" : "warn";
      const title =
        r.status === "accepted"
          ? "Referral accepted"
          : r.status === "rejected"
            ? "Referral declined"
            : r.status === "withdrawn"
              ? "Referral withdrawn"
              : "Referral waiting on the clinic";
      return {
        id: `ref-${r.id}`,
        at: r.created_at,
        icon: "fa-hospital-user",
        tone,
        title: r.patient_name ? `${title} — ${r.patient_name}` : title,
        href: "/hospital/dashboard/referrals",
      };
    })
  );
}

export type FeedActivityRow = {
  id: string;
  action: string;
  created_at: string;
  actor_name?: string | null;
  summary?: string | null;
};

/** The admin's feed is the real audit log, not a derivation -- every
 *  mutating admin route already records one (recordAdminActivity). Pending
 *  queues are passed separately so they can be marked as needing a person. */
/** Turns "setting.update" / "account.approve" into something a person
 *  reads: "Setting updated", "Account approved". Falls back to the raw
 *  action with its separators softened, so a newly added action type is
 *  never rendered as a bare identifier. */
function humaniseAction(action: string): string {
  const [subject, verb] = action.split(".");
  const words = (value: string) => value.replaceAll("_", " ").trim();
  if (!verb) return words(action).replace(/^./, (c) => c.toUpperCase());
  const past = verb.endsWith("e") ? `${verb}d` : verb.endsWith("y") ? `${verb.slice(0, -1)}ied` : `${verb}ed`;
  return `${words(subject).replace(/^./, (c) => c.toUpperCase())} ${words(past)}`;
}

export function buildAdminFeed({
  activity,
  pendingApprovals = 0,
  pendingRequests = 0,
  failedSyncs = 0,
}: {
  activity: FeedActivityRow[];
  pendingApprovals?: number;
  pendingRequests?: number;
  failedSyncs?: number;
}): FeedItem[] {
  // Bulk edits write one audit row per field, so a single "save settings"
  // click can land ten identical-looking lines in a row. Collapse repeats
  // of the same action+target into one item carrying the count -- the log
  // itself (Settings > Activity) still has every individual row.
  const collapsed = new Map<string, { row: FeedActivityRow; count: number }>();
  for (const a of activity) {
    const key = `${a.action}::${a.summary ?? ""}`;
    const seen = collapsed.get(key);
    if (seen) {
      seen.count += 1;
      if (a.created_at > seen.row.created_at) seen.row = a;
    } else {
      collapsed.set(key, { row: a, count: 1 });
    }
  }

  const items: FeedItem[] = [...collapsed.values()].map(({ row, count }) => ({
    id: `act-${row.id}`,
    at: row.created_at,
    icon: "fa-clock-rotate-left",
    tone: "neutral" as FeedTone,
    title: row.summary ? `${humaniseAction(row.action)} — ${row.summary}` : humaniseAction(row.action),
    detail: [row.actor_name ? `by ${row.actor_name}` : null, count > 1 ? `${count} changes` : null]
      .filter(Boolean)
      .join(" · ") || undefined,
  }));

  const now = new Date().toISOString();
  if (pendingApprovals > 0) {
    items.push({
      id: "queue-approvals",
      at: now,
      icon: "fa-user-check",
      tone: "warn",
      title: `${pendingApprovals} signup${pendingApprovals === 1 ? "" : "s"} waiting for approval`,
      href: "/admin/dashboard?section=today&tab=approvals",
      needsYou: true,
    });
  }
  if (pendingRequests > 0) {
    items.push({
      id: "queue-requests",
      at: now,
      icon: "fa-file-pen",
      tone: "warn",
      title: `${pendingRequests} change request${pendingRequests === 1 ? "" : "s"} to review`,
      href: "/admin/dashboard?section=today&tab=requests",
      needsYou: true,
    });
  }
  if (failedSyncs > 0) {
    items.push({
      id: "queue-sync",
      at: now,
      icon: "fa-triangle-exclamation",
      tone: "bad",
      title: `${failedSyncs} session${failedSyncs === 1 ? "" : "s"} without a meeting link`,
      detail: "Google Calendar sync failed — retry from Sync Health.",
      href: "/admin/dashboard?section=today&tab=sync",
      needsYou: true,
    });
  }

  return sortFeed(items, 14);
}
