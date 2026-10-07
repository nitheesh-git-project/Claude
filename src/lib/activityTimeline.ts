// A timestamped history of everything done to a session or by / to a person,
// for the admin dashboard: the session drawer's History, and the Activity log
// on a patient's, therapist's or hospital's profile.
//
// Built from what the platform already records -- the appointment row's own
// timestamps, appointment_reassignment_log, payments and payment failures,
// refund attempts, session notes, pain assessments, care plans, referrals,
// documents, profile change requests, checkout payment tries, and the admin
// activity log -- rather than from a new event table, so history from before
// this screen existed is there on day one and nothing new has to be kept in
// step with every write. Each line names who acted: the patient, the
// therapist, the hospital, an admin, or the system (the payment webhook, the
// auto-assigner).
//
// This module is the shaping and the filtering, with the database taken out,
// so both are unit-tested; activityTimelineServer.ts does the reads.

import { formatClinicDateTime } from "@/lib/formatDateTime";
import { formatRupees } from "@/lib/formatMoney";

export const ACTIVITY_CATEGORIES = [
  "booking",
  "payment",
  "assignment",
  "clinical",
  "account",
  "admin",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  booking: "Bookings",
  payment: "Payments",
  assignment: "Assignments",
  clinical: "Clinical",
  account: "Account",
  admin: "Admin actions",
};

export const ACTIVITY_ACTOR_ROLES = ["patient", "therapist", "hospital", "admin", "system"] as const;
export type ActivityActorRole = (typeof ACTIVITY_ACTOR_ROLES)[number];

export type ActivityEvent = {
  /** Stable within one timeline: source + row id (+ suffix). */
  id: string;
  at: string;
  category: ActivityCategory;
  actorRole: ActivityActorRole;
  actorName: string | null;
  title: string;
  detail?: string | null;
  /** The session this line is about, on a person's timeline. */
  sessionCode?: string | null;
};

export type ActivityFilter = {
  categories?: ActivityCategory[];
  actorRoles?: ActivityActorRole[];
  /** Inclusive clinic-local date keys (YYYY-MM-DD). */
  from?: string | null;
  to?: string | null;
  query?: string;
};

/** Clinic-local (IST) calendar day of an instant, for the date filter. */
export function activityDateKey(at: string): string {
  return new Date(new Date(at).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Newest first; ties broken by id so the order never jumps between renders. */
export function sortActivity(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || a.id.localeCompare(b.id)
  );
}

export function filterActivity(events: ActivityEvent[], filter: ActivityFilter): ActivityEvent[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  return events.filter((e) => {
    if (filter.categories?.length && !filter.categories.includes(e.category)) return false;
    if (filter.actorRoles?.length && !filter.actorRoles.includes(e.actorRole)) return false;
    const day = activityDateKey(e.at);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (query) {
      const haystack = [e.title, e.detail, e.actorName, e.sessionCode].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Which categories and actors a timeline actually has, for the filter chips. */
export function activityFacets(events: ActivityEvent[]): {
  categories: ActivityCategory[];
  actorRoles: ActivityActorRole[];
} {
  return {
    categories: ACTIVITY_CATEGORIES.filter((c) => events.some((e) => e.category === c)),
    actorRoles: ACTIVITY_ACTOR_ROLES.filter((r) => events.some((e) => e.actorRole === r)),
  };
}

// ---- Shaping rows into events ---------------------------------------------


export type NameLookup = (id: string | null | undefined) => { name: string | null; role: ActivityActorRole } | null;

function rupees(paise: number | null | undefined): string | null {
  if (typeof paise !== "number") return null;
  return `₹${formatRupees(paise)}`;
}

function who(lookup: NameLookup, id: string | null | undefined, fallback: ActivityActorRole) {
  const found = lookup(id);
  return { actorRole: found?.role ?? fallback, actorName: found?.name ?? null };
}

export type SessionRow = {
  id: string;
  session_code?: string | null;
  patient_id: string;
  created_at?: string | null;
  slot_time?: string | null;
  visit_mode?: string | null;
  paid_at?: string | null;
  amount_paid_paise?: number | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  completed_at?: string | null;
  refunded_at?: string | null;
  refunded_by?: string | null;
  refund_amount_paise?: number | null;
  cash_collected_at?: string | null;
  cash_collected_by?: string | null;
  cash_collected_amount_paise?: number | null;
  therapist_en_route_at?: string | null;
  therapist_arrived_at?: string | null;
  patient_feedback_at?: string | null;
  patient_rating?: number | null;
  therapist_feedback_at?: string | null;
  therapist_id?: string | null;
  therapist_payout_paid_at?: string | null;
};

export type ReassignmentRow = {
  id: string;
  appointment_id: string;
  changed_by: string | null;
  changed_at: string;
  old_therapist_id: string | null;
  new_therapist_id: string | null;
  old_slot_time: string | null;
  new_slot_time: string | null;
  old_category_id?: string | null;
  new_category_id?: string | null;
};

export type PaymentRow = {
  id: string;
  purpose: string | null;
  amount_paise: number | null;
  status: string | null;
  captured_at: string | null;
  created_at: string;
  target_appointment_id?: string | null;
};

export type PaymentFailureRow = {
  id: string;
  appointment_id: string | null;
  amount_paise: number | null;
  error_description: string | null;
  error_reason: string | null;
  created_at: string;
};

export type RefundAttemptRow = {
  id: string;
  appointment_id: string | null;
  amount_paise: number | null;
  status: string | null;
  reason: string | null;
  requested_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type SessionNoteRow = {
  id: string;
  appointment_id: string;
  therapist_id: string | null;
  created_at: string;
  updated_at?: string | null;
  locked_at?: string | null;
};

export type AdminLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_id: string | null;
  target_label?: string | null;
  amount_paise?: number | null;
  created_at: string;
};

/** The appointment row's own timestamps, each a line. */
export function eventsFromSession(row: SessionRow, lookup: NameLookup): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  const code = row.session_code ?? null;
  const add = (suffix: string, e: Omit<ActivityEvent, "id" | "sessionCode">) =>
    out.push({ ...e, id: `appt:${row.id}:${suffix}`, sessionCode: code });

  if (row.created_at) {
    add("created", {
      at: row.created_at,
      category: "booking",
      ...who(lookup, row.patient_id, "patient"),
      title: row.visit_mode === "home_visit" ? "Home visit booked" : "Session booked",
      detail: row.slot_time ? `For ${formatClinicDateTime(row.slot_time)}` : null,
    });
  }
  if (row.paid_at) {
    add("paid", {
      at: row.paid_at,
      category: "payment",
      actorRole: "system",
      actorName: null,
      title: "Payment received",
      detail: rupees(row.amount_paid_paise),
    });
  }
  if (row.therapist_en_route_at) {
    add("en-route", {
      at: row.therapist_en_route_at,
      category: "assignment",
      ...who(lookup, row.therapist_id, "therapist"),
      title: "Therapist set off for the visit",
    });
  }
  if (row.therapist_arrived_at) {
    add("arrived", {
      at: row.therapist_arrived_at,
      category: "assignment",
      ...who(lookup, row.therapist_id, "therapist"),
      title: "Therapist arrived",
    });
  }
  if (row.cash_collected_at) {
    add("cash", {
      at: row.cash_collected_at,
      category: "payment",
      ...who(lookup, row.cash_collected_by, "therapist"),
      title: "Cash collected at the door",
      detail: rupees(row.cash_collected_amount_paise),
    });
  }
  if (row.completed_at) {
    add("completed", {
      at: row.completed_at,
      category: "clinical",
      ...who(lookup, row.therapist_id, "therapist"),
      title: "Session completed",
    });
  }
  if (row.patient_feedback_at) {
    add("patient-feedback", {
      at: row.patient_feedback_at,
      category: "clinical",
      ...who(lookup, row.patient_id, "patient"),
      title: "Patient left feedback",
      detail: typeof row.patient_rating === "number" ? `${row.patient_rating} of 5` : null,
    });
  }
  if (row.therapist_feedback_at) {
    add("therapist-feedback", {
      at: row.therapist_feedback_at,
      category: "clinical",
      ...who(lookup, row.therapist_id, "therapist"),
      title: "Therapist left feedback",
    });
  }
  if (row.cancelled_at) {
    add("cancelled", {
      at: row.cancelled_at,
      category: "booking",
      ...who(lookup, row.cancelled_by, "system"),
      title: "Session cancelled",
      detail: row.cancellation_reason ?? null,
    });
  }
  if (row.refunded_at) {
    add("refunded", {
      at: row.refunded_at,
      category: "payment",
      ...who(lookup, row.refunded_by, "admin"),
      title: "Refunded",
      detail: rupees(row.refund_amount_paise),
    });
  }
  if (row.therapist_payout_paid_at) {
    add("payout", {
      at: row.therapist_payout_paid_at,
      category: "payment",
      actorRole: "admin",
      actorName: null,
      title: "Therapist paid for this session",
    });
  }
  return out;
}

export function eventsFromReassignments(
  rows: ReassignmentRow[],
  lookup: NameLookup,
  codeFor: (appointmentId: string) => string | null = () => null,
  categoryName: (id: string | null | undefined) => string | null = () => null
): ActivityEvent[] {
  return rows.map((r) => {
    const from = lookup(r.old_therapist_id)?.name ?? null;
    const to = lookup(r.new_therapist_id)?.name ?? null;
    const moved = r.old_slot_time !== r.new_slot_time && r.new_slot_time;
    const changedTherapist = r.old_therapist_id !== r.new_therapist_id;
    const changedCategory =
      r.old_category_id !== undefined && (r.old_category_id ?? null) !== (r.new_category_id ?? null);
    const title = !r.old_therapist_id && r.new_therapist_id
      ? `Assigned to ${to ?? "a therapist"}`
      : changedTherapist && moved
        ? "Reassigned and rescheduled"
        : changedTherapist
          ? `Reassigned to ${to ?? "another therapist"}`
          : moved
            ? "Rescheduled"
            : changedCategory
              ? "Session type changed"
              : "Session updated";
    const detail = [
      changedTherapist && r.old_therapist_id ? `From ${from ?? "previous therapist"}` : null,
      moved ? `New time ${formatClinicDateTime(r.new_slot_time)}` : null,
      changedCategory
        ? `Type: ${categoryName(r.old_category_id) ?? "none"} to ${categoryName(r.new_category_id) ?? "none"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `reassign:${r.id}`,
      at: r.changed_at,
      category: "assignment" as const,
      ...who(lookup, r.changed_by, "system"),
      title,
      detail: detail || null,
      sessionCode: codeFor(r.appointment_id),
    };
  });
}

const PAYMENT_PURPOSE: Record<string, string> = {
  appointment: "session",
  session_package: "programme",
  home_visit_package: "home visit",
  pay_later: "settlement of what was owed",
};

export function eventsFromPayments(rows: PaymentRow[], lookup: NameLookup, patientId: string): ActivityEvent[] {
  return rows.map((p) => ({
    id: `payment:${p.id}`,
    at: p.captured_at ?? p.created_at,
    category: "payment" as const,
    ...who(lookup, patientId, "patient"),
    title:
      p.status === "captured" || p.captured_at
        ? `Paid for a ${PAYMENT_PURPOSE[p.purpose ?? ""] ?? "purchase"}`
        : `Payment ${p.status ?? "recorded"}`,
    detail: rupees(p.amount_paise),
  }));
}

export function eventsFromPaymentFailures(rows: PaymentFailureRow[], lookup: NameLookup, patientId: string): ActivityEvent[] {
  return rows.map((f) => ({
    id: `payfail:${f.id}`,
    at: f.created_at,
    category: "payment" as const,
    ...who(lookup, patientId, "patient"),
    title: "Payment failed",
    detail: [rupees(f.amount_paise), f.error_description ?? f.error_reason].filter(Boolean).join(" · ") || null,
  }));
}

export function eventsFromRefundAttempts(rows: RefundAttemptRow[], lookup: NameLookup): ActivityEvent[] {
  return rows.map((r) => ({
    id: `refund:${r.id}`,
    at: r.resolved_at ?? r.created_at,
    category: "payment" as const,
    ...who(lookup, r.requested_by, "admin"),
    title: r.status === "succeeded" ? "Refund sent" : r.status === "failed" ? "Refund failed" : "Refund requested",
    detail: [rupees(r.amount_paise), r.reason].filter(Boolean).join(" · ") || null,
  }));
}

export function eventsFromSessionNotes(
  rows: SessionNoteRow[],
  lookup: NameLookup,
  codeFor: (appointmentId: string) => string | null = () => null
): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const n of rows) {
    out.push({
      id: `note:${n.id}`,
      at: n.created_at,
      category: "clinical",
      ...who(lookup, n.therapist_id, "therapist"),
      title: "Session notes written",
      sessionCode: codeFor(n.appointment_id),
    });
    if (n.updated_at && n.updated_at !== n.created_at && !n.locked_at) {
      out.push({
        id: `note:${n.id}:edited`,
        at: n.updated_at,
        category: "clinical",
        ...who(lookup, n.therapist_id, "therapist"),
        title: "Session notes edited",
        sessionCode: codeFor(n.appointment_id),
      });
    }
  }
  return out;
}

/** Admin actions, labelled as the activity log labels them. */
export function eventsFromAdminLog(
  rows: AdminLogRow[],
  lookup: NameLookup,
  labelFor: (action: string) => string
): ActivityEvent[] {
  return rows.map((r) => ({
    id: `admin:${r.id}`,
    at: r.created_at,
    category: "admin" as const,
    ...who(lookup, r.actor_id, "admin"),
    title: labelFor(r.action),
    detail: [r.target_label, rupees(r.amount_paise)].filter(Boolean).join(" · ") || null,
  }));
}
