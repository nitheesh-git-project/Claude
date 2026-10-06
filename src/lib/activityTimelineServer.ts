import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_ACTIVITY_LABELS } from "@/lib/adminActivityLog";
import {
  eventsFromAdminLog,
  eventsFromPaymentFailures,
  eventsFromPayments,
  eventsFromReassignments,
  eventsFromRefundAttempts,
  eventsFromSession,
  eventsFromSessionNotes,
  sortActivity,
  type ActivityActorRole,
  type ActivityEvent,
  type AdminLogRow,
  type NameLookup,
  type ReassignmentRow,
  type SessionNoteRow,
  type SessionRow,
} from "@/lib/activityTimeline";

// The reads behind src/lib/activityTimeline.ts. Every read is bounded, and
// one that fails makes the whole timeline `null` -- "could not load", never a
// shorter history that reads as complete.

const SESSION_COLUMNS =
  "id, session_code, patient_id, therapist_id, created_at, slot_time, visit_mode, paid_at, amount_paid_paise, cancelled_at, cancelled_by, cancellation_reason, completed_at, refunded_at, refunded_by, refund_amount_paise, cash_collected_at, cash_collected_by, cash_collected_amount_paise, therapist_en_route_at, therapist_arrived_at, patient_feedback_at, patient_rating, therapist_feedback_at, therapist_payout_paid_at";

const CAP = 500;

function labelFor(action: string): string {
  return (ADMIN_ACTIVITY_LABELS as Record<string, string>)[action] ?? action.replace(/[._]/g, " ");
}

class ReadFailed extends Error {}

/** An admin assignment is written twice -- to the activity log and to
 *  appointment_reassignment_log, which says who it moved to. The second is
 *  the useful line, so the first is dropped when both describe one act. */
function withoutDuplicateAssignments(log: AdminLogRow[], reassignments: ReassignmentRow[]): AdminLogRow[] {
  return log.filter((entry) => {
    if (!/^session\.(assign|update)$/.test(entry.action)) return true;
    const at = new Date(entry.created_at).getTime();
    return !reassignments.some(
      (r) =>
        r.changed_by === entry.actor_id &&
        (r.appointment_id === entry.target_id || !entry.target_id) &&
        Math.abs(new Date(r.changed_at).getTime() - at) < 120_000
    );
  });
}

function rows<T>(res: { data: unknown; error: unknown }): T[] {
  if (res.error) throw new ReadFailed(String((res.error as { message?: string }).message ?? res.error));
  return (res.data ?? []) as T[];
}

async function nameLookup(admin: SupabaseClient, ids: (string | null | undefined)[]): Promise<NameLookup> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, { name: string | null; role: ActivityActorRole }>();
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    const found = rows<{ id: string; full_name: string | null; role: string }>(
      await admin.from("profiles").select("id, full_name, role").in("id", chunk)
    );
    for (const p of found) {
      const role: ActivityActorRole =
        p.role === "admin" || p.role === "therapist" || p.role === "hospital" ? p.role : "patient";
      map.set(p.id, { name: p.full_name?.trim() || null, role });
    }
  }
  return (id) => (id ? (map.get(id) ?? null) : null);
}

/** Everything that happened to one session, newest first. */
export async function loadSessionTimeline(
  admin: SupabaseClient,
  appointmentId: string
): Promise<ActivityEvent[] | null> {
  try {
    const appointmentRes = await admin.from("appointments").select(SESSION_COLUMNS).eq("id", appointmentId).maybeSingle();
    if (appointmentRes.error) return null;
    const appointment = appointmentRes.data as SessionRow | null;
    if (!appointment) return [];

    const [reassignments, adminLog, payments, failures, refunds, notes] = await Promise.all([
      admin.from("appointment_reassignment_log").select("*").eq("appointment_id", appointmentId).limit(CAP),
      admin.from("admin_activity_log").select("id, actor_id, action, target_id, target_label, amount_paise, created_at").eq("target_id", appointmentId).limit(CAP),
      admin.from("payments").select("id, purpose, amount_paise, status, captured_at, created_at, target_appointment_id").eq("target_appointment_id", appointmentId).limit(CAP),
      admin.from("payment_failure_log").select("id, appointment_id, amount_paise, error_description, error_reason, created_at").eq("appointment_id", appointmentId).limit(CAP),
      admin.from("refund_attempts").select("id, appointment_id, amount_paise, status, reason, requested_by, created_at, resolved_at").eq("appointment_id", appointmentId).limit(CAP),
      admin.from("session_notes").select("id, appointment_id, therapist_id, created_at, updated_at, locked_at").eq("appointment_id", appointmentId).limit(CAP),
    ]);
    const r = rows<ReassignmentRow>(reassignments);
    const log = withoutDuplicateAssignments(rows<AdminLogRow>(adminLog), rows<ReassignmentRow>(reassignments));
    const n = rows<SessionNoteRow>(notes);
    const refundRows = rows<Parameters<typeof eventsFromRefundAttempts>[0][number]>(refunds);
    const lookup = await nameLookup(admin, [
      appointment.patient_id,
      appointment.therapist_id,
      appointment.cancelled_by,
      appointment.refunded_by,
      appointment.cash_collected_by,
      ...r.flatMap((x) => [x.changed_by, x.old_therapist_id, x.new_therapist_id]),
      ...log.map((x) => x.actor_id),
      ...n.map((x) => x.therapist_id),
      ...refundRows.map((x) => x.requested_by),
    ]);
    const code = () => appointment.session_code ?? null;
    const categoryIds = [...new Set(r.flatMap((x) => [x.old_category_id, x.new_category_id]).filter((id): id is string => !!id))];
    const categories = categoryIds.length
      ? rows<{ id: string; title: string }>(await admin.from("treatment_categories").select("id, title").in("id", categoryIds))
      : [];
    const categoryName = (id: string | null | undefined) => categories.find((c) => c.id === id)?.title ?? null;
    return sortActivity([
      ...eventsFromSession(appointment, lookup),
      ...eventsFromReassignments(r, lookup, code, categoryName),
      ...eventsFromAdminLog(log, lookup, labelFor),
      ...eventsFromPayments(rows(payments), lookup, appointment.patient_id),
      ...eventsFromPaymentFailures(rows(failures), lookup, appointment.patient_id),
      ...eventsFromRefundAttempts(refundRows, lookup),
      ...eventsFromSessionNotes(n, lookup, code),
    ]);
  } catch (err) {
    console.error("loadSessionTimeline failed", appointmentId, err);
    return null;
  }
}

/** Everything done by or to one patient, therapist or hospital, newest first. */
export async function loadPersonTimeline(
  admin: SupabaseClient,
  profileId: string
): Promise<ActivityEvent[] | null> {
  try {
    const profileRes = await admin.from("profiles").select("id, role, full_name, created_at").eq("id", profileId).maybeSingle();
    if (profileRes.error) return null;
    const profile = profileRes.data as { id: string; role: string; full_name: string | null; created_at: string } | null;
    if (!profile) return [];
    const role = profile.role;
    const events: ActivityEvent[] = [];
    const actorIds: (string | null | undefined)[] = [profileId];

    // Their sessions: as the patient, or as the therapist on them.
    const sessionCol = role === "therapist" ? "therapist_id" : role === "patient" ? "patient_id" : null;
    const sessions = sessionCol
      ? rows<SessionRow>(
          await admin.from("appointments").select(SESSION_COLUMNS).eq(sessionCol, profileId).order("created_at", { ascending: false }).limit(200)
        )
      : [];
    const sessionIds = sessions.map((s) => s.id);
    const codeById = new Map(sessions.map((s) => [s.id, s.session_code ?? null]));
    const codeFor = (id: string) => codeById.get(id) ?? null;

    const inIds = <T,>(table: string, columns: string, column: string, ids: string[]) =>
      ids.length
        ? admin.from(table).select(columns).in(column, ids.slice(0, 200)).limit(CAP).then((res) => rows<T>(res))
        : Promise.resolve([] as T[]);

    const [reassignments, notes, adminOnPerson, adminOnSessions] = await Promise.all([
      role === "therapist"
        ? admin
            .from("appointment_reassignment_log")
            .select("*")
            .or(`old_therapist_id.eq.${profileId},new_therapist_id.eq.${profileId}`)
            .limit(CAP)
            .then((res) => rows<ReassignmentRow>(res))
        : inIds<ReassignmentRow>("appointment_reassignment_log", "*", "appointment_id", sessionIds),
      sessionCol
        ? admin
            .from("session_notes")
            .select("id, appointment_id, therapist_id, created_at, updated_at, locked_at")
            .eq(role === "therapist" ? "therapist_id" : "patient_id", profileId)
            .limit(CAP)
            .then((res) => rows<SessionNoteRow>(res))
        : Promise.resolve([] as SessionNoteRow[]),
      admin
        .from("admin_activity_log")
        .select("id, actor_id, action, target_id, target_label, amount_paise, created_at")
        .eq("target_id", profileId)
        .limit(CAP)
        .then((res) => rows<AdminLogRow>(res)),
      inIds<AdminLogRow>("admin_activity_log", "id, actor_id, action, target_id, target_label, amount_paise, created_at", "target_id", sessionIds),
    ]);

    actorIds.push(
      ...sessions.flatMap((s) => [s.patient_id, s.therapist_id, s.cancelled_by, s.refunded_by, s.cash_collected_by]),
      ...reassignments.flatMap((x) => [x.changed_by, x.old_therapist_id, x.new_therapist_id]),
      ...notes.map((x) => x.therapist_id),
      ...adminOnPerson.map((x) => x.actor_id),
      ...adminOnSessions.map((x) => x.actor_id)
    );

    // Per-role sources.
    if (role === "patient") {
      const [payments, failures, tries, pain, plans, changes, documents] = await Promise.all([
        admin.from("payments").select("id, purpose, amount_paise, status, captured_at, created_at").eq("patient_id", profileId).limit(CAP).then((res) => rows<Parameters<typeof eventsFromPayments>[0][number]>(res)),
        admin.from("payment_failure_log").select("id, appointment_id, amount_paise, error_description, error_reason, created_at").eq("patient_id", profileId).limit(CAP).then((res) => rows<Parameters<typeof eventsFromPaymentFailures>[0][number]>(res)),
        admin.from("checkout_payment_tries").select("id, outcome, flow, created_at").eq("patient_id", profileId).limit(CAP).then((res) => rows<{ id: string; outcome: string; flow: string; created_at: string }>(res)),
        admin.from("pain_assessments").select("id, region, side, pain_percent, submitted_by, submitted_by_role, created_at").eq("patient_id", profileId).limit(CAP).then((res) => rows<{ id: string; region: string; side: string; pain_percent: number; submitted_by: string | null; submitted_by_role: string | null; created_at: string }>(res)),
        admin.from("care_plans").select("id, therapist_id, status, created_at, submitted_at, reviewed_at, reviewed_by, accepted_at, declined_at").eq("patient_id", profileId).limit(CAP).then((res) => rows<{ id: string; therapist_id: string | null; status: string; created_at: string; submitted_at: string | null; reviewed_at: string | null; reviewed_by: string | null; accepted_at: string | null; declined_at: string | null }>(res)),
        admin.from("profile_change_requests").select("id, status, reviewed_by, reviewed_at, created_at").eq("user_id", profileId).limit(CAP).then((res) => rows<{ id: string; status: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string }>(res)),
        admin.from("patient_medical_documents").select("id, title, document_type, created_at").eq("patient_id", profileId).limit(CAP).then((res) => rows<{ id: string; title: string | null; document_type: string | null; created_at: string }>(res)),
      ]);
      const refunds = await inIds<Parameters<typeof eventsFromRefundAttempts>[0][number]>(
        "refund_attempts",
        "id, appointment_id, amount_paise, status, reason, requested_by, created_at, resolved_at",
        "appointment_id",
        sessionIds
      );
      actorIds.push(
        ...pain.map((x) => x.submitted_by),
        ...plans.flatMap((x) => [x.therapist_id, x.reviewed_by]),
        ...changes.map((x) => x.reviewed_by),
        ...refunds.map((x) => x.requested_by)
      );
      const lookup = await nameLookup(admin, actorIds);
      const self = { actorRole: "patient" as const, actorName: profile.full_name };
      events.push(
        ...eventsFromPayments(payments, lookup, profileId),
        ...eventsFromPaymentFailures(failures, lookup, profileId),
        ...eventsFromRefundAttempts(refunds, lookup),
        ...tries.map((t) => ({
          id: `try:${t.id}`,
          at: t.created_at,
          category: "payment" as const,
          ...self,
          title:
            t.outcome === "dismissed"
              ? "Closed the payment window without paying"
              : t.outcome === "failed"
                ? "A payment attempt failed"
                : "Could not start a payment (our error)",
          detail: t.flow === "home_visit" ? "Home visit checkout" : "Session checkout",
        })),
        ...pain.map((a) => {
          const by = lookup(a.submitted_by);
          return {
            id: `pain:${a.id}`,
            at: a.created_at,
            category: "clinical" as const,
            actorRole: (by?.role ?? (a.submitted_by_role === "therapist" ? "therapist" : "patient")) as ActivityActorRole,
            actorName: by?.name ?? null,
            title: "Pain scored on the Pain Map",
            detail: `${a.region.replace(/_/g, " ")}${a.side && a.side !== "na" ? ` (${a.side})` : ""}: ${(a.pain_percent / 10).toFixed(1)}/10`,
          };
        }),
        ...plans.flatMap((p) => {
          const therapist = lookup(p.therapist_id);
          const out: ActivityEvent[] = [
            { id: `plan:${p.id}`, at: p.created_at, category: "clinical", actorRole: "therapist", actorName: therapist?.name ?? null, title: "Care plan drafted" },
          ];
          if (p.reviewed_at) out.push({ id: `plan:${p.id}:reviewed`, at: p.reviewed_at, category: "clinical", ...whoIs(lookup, p.reviewed_by, "admin"), title: "Care plan reviewed by the clinic" });
          if (p.accepted_at) out.push({ id: `plan:${p.id}:accepted`, at: p.accepted_at, category: "clinical", ...self, title: "Care plan accepted" });
          if (p.declined_at) out.push({ id: `plan:${p.id}:declined`, at: p.declined_at, category: "clinical", ...self, title: "Care plan declined" });
          return out;
        }),
        ...changes.flatMap((c) => {
          const out: ActivityEvent[] = [
            { id: `change:${c.id}`, at: c.created_at, category: "account", ...self, title: "Asked to change their profile" },
          ];
          if (c.reviewed_at) out.push({ id: `change:${c.id}:reviewed`, at: c.reviewed_at, category: "account", ...whoIs(lookup, c.reviewed_by, "admin"), title: `Profile change ${c.status}` });
          return out;
        }),
        ...documents.map((d) => ({
          id: `doc:${d.id}`,
          at: d.created_at,
          category: "clinical" as const,
          ...self,
          title: "Uploaded a document",
          detail: d.title ?? d.document_type ?? null,
        }))
      );
      events.push(...finishCommon(profile, lookup, sessions, reassignments, notes, adminOnPerson, adminOnSessions, codeFor));
      return sortActivity(events);
    }

    if (role === "hospital") {
      const referrals = rows<{ id: string; patient_name: string | null; status: string; created_at: string; declined_at: string | null; declined_by: string | null; withdrawn_at: string | null; withdrawn_by: string | null; assigned_slot_time: string | null }>(
        await admin.from("patient_referrals").select("id, patient_name, status, created_at, declined_at, declined_by, withdrawn_at, withdrawn_by, assigned_slot_time").eq("hospital_id", profileId).limit(CAP)
      );
      actorIds.push(...referrals.flatMap((r) => [r.declined_by, r.withdrawn_by]));
      const lookup = await nameLookup(admin, actorIds);
      const self = { actorRole: "hospital" as const, actorName: profile.full_name };
      for (const r of referrals) {
        events.push({ id: `ref:${r.id}`, at: r.created_at, category: "booking", ...self, title: "Referred a patient", detail: r.patient_name });
        if (r.declined_at) events.push({ id: `ref:${r.id}:declined`, at: r.declined_at, category: "booking", ...whoIs(lookup, r.declined_by, "admin"), title: "Referral declined", detail: r.patient_name });
        if (r.withdrawn_at) events.push({ id: `ref:${r.id}:withdrawn`, at: r.withdrawn_at, category: "booking", ...whoIs(lookup, r.withdrawn_by, "hospital"), title: "Referral withdrawn", detail: r.patient_name });
      }
      events.push(...finishCommon(profile, lookup, sessions, reassignments, notes, adminOnPerson, adminOnSessions, codeFor));
      return sortActivity(events);
    }

    // Therapist (and anything else): sessions, notes, reassignments, admin.
    const plans = role === "therapist"
      ? rows<{ id: string; created_at: string; accepted_at: string | null }>(
          await admin.from("care_plans").select("id, created_at, accepted_at").eq("therapist_id", profileId).limit(CAP)
        )
      : [];
    const lookup = await nameLookup(admin, actorIds);
    events.push(
      ...plans.map((p) => ({
        id: `plan:${p.id}`,
        at: p.created_at,
        category: "clinical" as const,
        actorRole: "therapist" as const,
        actorName: profile.full_name,
        title: "Drafted a care plan",
      }))
    );
    events.push(...finishCommon(profile, lookup, sessions, reassignments, notes, adminOnPerson, adminOnSessions, codeFor));
    return sortActivity(events);
  } catch (err) {
    console.error("loadPersonTimeline failed", profileId, err);
    return null;
  }
}

function whoIs(lookup: NameLookup, id: string | null | undefined, fallback: ActivityActorRole) {
  const found = lookup(id);
  return { actorRole: found?.role ?? fallback, actorName: found?.name ?? null };
}

function finishCommon(
  profile: { id: string; role: string; full_name: string | null; created_at: string },
  lookup: NameLookup,
  sessions: SessionRow[],
  reassignments: ReassignmentRow[],
  notes: SessionNoteRow[],
  adminOnPerson: AdminLogRow[],
  adminOnSessions: AdminLogRow[],
  codeFor: (id: string) => string | null
): ActivityEvent[] {
  const selfRole: ActivityActorRole =
    profile.role === "therapist" || profile.role === "hospital" || profile.role === "admin" ? profile.role : "patient";
  return [
    {
      id: `account:${profile.id}:created`,
      at: profile.created_at,
      category: "account",
      actorRole: selfRole,
      actorName: profile.full_name,
      title: "Account created",
    },
    ...sessions.flatMap((s) => eventsFromSession(s, lookup)),
    ...eventsFromReassignments(reassignments, lookup, codeFor),
    ...eventsFromSessionNotes(notes, lookup, codeFor),
    ...eventsFromAdminLog(adminOnPerson, lookup, labelFor),
    ...eventsFromAdminLog(withoutDuplicateAssignments(adminOnSessions, reassignments), lookup, labelFor).map((e) => ({
      ...e,
      sessionCode: codeFor(adminOnSessions.find((r) => `admin:${r.id}` === e.id)?.target_id ?? ""),
    })),
  ];
}
