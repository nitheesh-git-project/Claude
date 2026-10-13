import type { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityRow } from "@/components/admin/AdminActivityLogTab";
import {
  buildUserActivitySummary,
  isLogActorRole,
  UUID_RE,
  type UserActivityAction,
  type UserActorRole,
} from "@/lib/userActivity";

type AdminClient = ReturnType<typeof createAdminClient>;

// The server half of "All Logs shows everyone".
//
// `recordUserActivity` is what the patient, therapist and hospital routes call
// after the thing they do has happened. The rest of the file is the read side:
// turning `user_activity_log` rows into the shape the Logs screen already
// renders, and giving the older admin rows the subjects (patient, therapist,
// programme, condition) the new filters run on -- resolved from the row each
// entry named, so the entries written before this existed are filterable too.
//
// Best-effort throughout. A log that cannot be written must never fail the
// booking or the payment it describes, and a log that cannot be enriched is
// still a log.

// --------------------------------------------------------------------------
// Resolving a subject
// --------------------------------------------------------------------------

type Subject = {
  patientId: string | null;
  therapistId: string | null;
  appointmentId: string | null;
  sessionCode: string | null;
  programmeCode: string | null;
  categoryId: string | null;
};

const EMPTY_SUBJECT: Subject = {
  patientId: null,
  therapistId: null,
  appointmentId: null,
  sessionCode: null,
  programmeCode: null,
  categoryId: null,
};

const CHUNK = 80;

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function ids(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && UUID_RE.test(v))));
}

/** One batched read per table; a failure is logged and reads as "not found". */
async function readIn<R>(
  label: string,
  run: (batch: string[]) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
  values: string[]
): Promise<R[]> {
  const out: R[] = [];
  for (const batch of chunk(values)) {
    try {
      const { data, error } = await run(batch);
      if (error) {
        console.error("activity subject lookup failed", label, error.message);
        continue;
      }
      out.push(...(data ?? []));
    } catch (err) {
      console.error("activity subject lookup threw", label, err);
    }
  }
  return out;
}

type PurchaseRow = {
  id: string;
  patient_id: string | null;
  programme_code: string | null;
  category_id?: string | null;
  package_id?: string | null;
  locked_therapist_id: string | null;
};

async function lookupPackagePurchases(admin: AdminClient, values: string[]): Promise<Map<string, Subject>> {
  const rows = await readIn<PurchaseRow>(
    "patient_package_purchases",
    (batch) =>
      admin
        .from("patient_package_purchases")
        .select("id, patient_id, programme_code, category_id, locked_therapist_id")
        .in("id", batch),
    values
  );
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...EMPTY_SUBJECT,
        patientId: r.patient_id,
        therapistId: r.locked_therapist_id,
        programmeCode: r.programme_code,
        categoryId: r.category_id ?? null,
      },
    ])
  );
}

async function lookupHomeVisitPurchases(admin: AdminClient, values: string[]): Promise<Map<string, Subject>> {
  const rows = await readIn<PurchaseRow>(
    "home_visit_package_purchases",
    (batch) =>
      admin
        .from("home_visit_package_purchases")
        .select("id, patient_id, programme_code, package_id, locked_therapist_id")
        .in("id", batch),
    values
  );
  // A home-visit purchase has no condition of its own; its package does.
  const packages = await readIn<{ id: string; category_id: string | null }>(
    "home_visit_packages",
    (batch) => admin.from("home_visit_packages").select("id, category_id").in("id", batch),
    ids(rows.map((r) => r.package_id))
  );
  const categoryByPackage = new Map(packages.map((p) => [p.id, p.category_id]));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...EMPTY_SUBJECT,
        patientId: r.patient_id,
        therapistId: r.locked_therapist_id,
        programmeCode: r.programme_code,
        categoryId: r.package_id ? categoryByPackage.get(r.package_id) ?? null : null,
      },
    ])
  );
}

async function lookupCarePlans(admin: AdminClient, values: string[]): Promise<Map<string, Subject>> {
  const rows = await readIn<{
    id: string;
    patient_id: string;
    therapist_id: string;
    category_id: string | null;
    programme_code: string | null;
  }>(
    "care_plans",
    (batch) =>
      admin.from("care_plans").select("id, patient_id, therapist_id, category_id, programme_code").in("id", batch),
    values
  );
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...EMPTY_SUBJECT,
        patientId: r.patient_id,
        therapistId: r.therapist_id,
        programmeCode: r.programme_code,
        categoryId: r.category_id,
      },
    ])
  );
}

async function lookupAppointments(admin: AdminClient, values: string[]): Promise<Map<string, Subject>> {
  const rows = await readIn<{
    id: string;
    patient_id: string;
    therapist_id: string | null;
    session_code: string | null;
    category_id: string | null;
    package_purchase_id: string | null;
    home_visit_purchase_id: string | null;
  }>(
    "appointments",
    (batch) =>
      admin
        .from("appointments")
        .select("id, patient_id, therapist_id, session_code, category_id, package_purchase_id, home_visit_purchase_id")
        .in("id", batch),
    values
  );
  // The programme a session belongs to is on the purchase that paid for it.
  const [packages, visits] = await Promise.all([
    lookupPackagePurchases(admin, ids(rows.map((r) => r.package_purchase_id))),
    lookupHomeVisitPurchases(admin, ids(rows.map((r) => r.home_visit_purchase_id))),
  ]);
  return new Map(
    rows.map((r) => {
      const purchase =
        (r.package_purchase_id && packages.get(r.package_purchase_id)) ||
        (r.home_visit_purchase_id && visits.get(r.home_visit_purchase_id)) ||
        null;
      return [
        r.id,
        {
          patientId: r.patient_id,
          therapistId: r.therapist_id ?? purchase?.therapistId ?? null,
          appointmentId: r.id,
          sessionCode: r.session_code,
          programmeCode: purchase?.programmeCode ?? null,
          categoryId: r.category_id ?? purchase?.categoryId ?? null,
        },
      ];
    })
  );
}

type ProfileRow = { id: string; role: string | null; full_name: string | null };

async function lookupProfiles(admin: AdminClient, values: string[]): Promise<ProfileRow[]> {
  return readIn<ProfileRow>(
    "profiles",
    (batch) => admin.from("profiles").select("id, role, full_name").in("id", batch),
    values
  );
}

async function lookupCategoryNames(admin: AdminClient, values: string[]): Promise<Map<string, string>> {
  const rows = await readIn<{ id: string; title: string | null }>(
    "treatment_categories",
    (batch) => admin.from("treatment_categories").select("id, title").in("id", batch),
    values
  );
  return new Map(rows.filter((r) => r.title).map((r) => [r.id, r.title as string]));
}

// --------------------------------------------------------------------------
// Writing
// --------------------------------------------------------------------------

export type UserActivityInput = {
  action: UserActivityAction;
  /** Who did it. `id` is null for the system -- and for a patient whose id
   *  is whoever the subject row names (a payment seen by the webhook). */
  actor: { id: string | null; role: UserActorRole };
  /** Any of these may be given; the rest of the subject is resolved from it. */
  appointmentId?: string | null;
  carePlanId?: string | null;
  packagePurchaseId?: string | null;
  homeVisitPurchaseId?: string | null;
  patientId?: string | null;
  therapistId?: string | null;
  categoryId?: string | null;
  programmeCode?: string | null;
  sessionCode?: string | null;
  /** For a person who has no account (a referred patient): the name as given. */
  patientName?: string | null;
  amountPaise?: number | null;
  /** A short clause appended to the sentence ("refund of ₹500 issued"). */
  note?: string | null;
  details?: Record<string, unknown> | null;
  /** One real-world event, one row: a second insert with this key is dropped. */
  dedupeKey?: string | null;
};

/**
 * Records what a patient, therapist, hospital or the system did. Returns
 * whether it managed to.
 *
 * Never throws and never blocks the caller's flow -- the action it describes
 * has already happened, and refusing a booking because the log was
 * unreachable is the worse outcome. Call it with `await` after the action
 * succeeds: a floating promise can be cut off when the serverless response
 * returns, and the entry is the evidence.
 */
export async function recordUserActivity(admin: AdminClient, input: UserActivityInput): Promise<boolean> {
  try {
    const subject: Subject = { ...EMPTY_SUBJECT };
    const take = (s: Subject | undefined) => {
      if (!s) return;
      subject.patientId ??= s.patientId;
      subject.therapistId ??= s.therapistId;
      subject.appointmentId ??= s.appointmentId;
      subject.sessionCode ??= s.sessionCode;
      subject.programmeCode ??= s.programmeCode;
      subject.categoryId ??= s.categoryId;
    };
    // What the caller already knows wins over anything looked up.
    subject.patientId = input.patientId ?? null;
    subject.therapistId = input.therapistId ?? null;
    subject.appointmentId = input.appointmentId ?? null;
    subject.sessionCode = input.sessionCode ?? null;
    subject.programmeCode = input.programmeCode ?? null;
    subject.categoryId = input.categoryId ?? null;

    const [appointment, plan, pkg, visit] = await Promise.all([
      input.appointmentId ? lookupAppointments(admin, [input.appointmentId]) : null,
      input.carePlanId ? lookupCarePlans(admin, [input.carePlanId]) : null,
      input.packagePurchaseId ? lookupPackagePurchases(admin, [input.packagePurchaseId]) : null,
      input.homeVisitPurchaseId ? lookupHomeVisitPurchases(admin, [input.homeVisitPurchaseId]) : null,
    ]);
    take(appointment?.get(input.appointmentId as string));
    take(plan?.get(input.carePlanId as string));
    take(pkg?.get(input.packagePurchaseId as string));
    take(visit?.get(input.homeVisitPurchaseId as string));

    // A payment is seen by a webhook that does not know who paid; the patient
    // on the row it settled is the actor.
    const actorId = input.actor.id ?? (input.actor.role === "patient" ? subject.patientId : null);
    const personIds = ids([actorId, subject.patientId, subject.therapistId]);
    const [profiles, categories] = await Promise.all([
      personIds.length > 0 ? lookupProfiles(admin, personIds) : Promise.resolve([] as ProfileRow[]),
      subject.categoryId ? lookupCategoryNames(admin, [subject.categoryId]) : Promise.resolve(new Map<string, string>()),
    ]);
    const nameOf = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? null : null);
    const actorName = nameOf(actorId);
    const patientName = nameOf(subject.patientId) ?? input.patientName?.trim().slice(0, 120) ?? null;
    const therapistName = nameOf(subject.therapistId);
    const conditionName = subject.categoryId ? categories.get(subject.categoryId) ?? null : null;

    const summary = buildUserActivitySummary(input.action, {
      actorRole: input.actor.role,
      actorName,
      patientName,
      therapistName,
      sessionCode: subject.sessionCode,
      programmeCode: subject.programmeCode,
      conditionName,
      amountPaise: input.amountPaise ?? null,
      note: input.note ?? null,
    });

    const row = {
      actor_id: actorId,
      actor_role: input.actor.role,
      actor_name: actorName,
      action: input.action,
      summary,
      patient_id: subject.patientId,
      patient_name: patientName,
      therapist_id: subject.therapistId,
      therapist_name: therapistName,
      appointment_id: subject.appointmentId,
      session_code: subject.sessionCode,
      programme_code: subject.programmeCode,
      category_id: subject.categoryId,
      condition_name: conditionName,
      amount_paise: input.amountPaise ?? null,
      details: input.details ?? null,
      dedupe_key: input.dedupeKey ?? null,
    };

    const { error } = input.dedupeKey
      ? await admin.from("user_activity_log").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })
      : await admin.from("user_activity_log").insert(row);
    if (error) {
      console.error("user activity log write failed", input.action, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("user activity log write threw", input.action, err);
    return false;
  }
}

// --------------------------------------------------------------------------
// Reading
// --------------------------------------------------------------------------

export const USER_ACTIVITY_SELECT =
  "id, actor_id, actor_role, actor_name, action, summary, patient_id, patient_name, therapist_id, therapist_name, appointment_id, session_code, programme_code, condition_name, amount_paise, details, created_at";

export type UserActivityDbRow = {
  id: string;
  actor_id: string | null;
  actor_role: string;
  actor_name: string | null;
  action: string;
  summary: string;
  patient_id: string | null;
  patient_name: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  appointment_id: string | null;
  session_code: string | null;
  programme_code: string | null;
  condition_name: string | null;
  amount_paise: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

/** A `user_activity_log` row in the shape the Logs screen renders. */
export function userActivityToRow(r: UserActivityDbRow, includeMoney: boolean): ActivityRow {
  const role = isLogActorRole(r.actor_role) ? r.actor_role : "system";
  return {
    id: r.id,
    actorName: r.actor_name ?? (role === "system" ? "System" : "Unknown"),
    actorRole: role,
    actorId: r.actor_id,
    action: r.action,
    summary: r.summary,
    // The row to trace in the subject timeline: the session when there is
    // one, else the patient. The timeline route matches either.
    targetId: r.appointment_id ?? r.patient_id ?? r.therapist_id,
    targetLabel: r.patient_name ?? r.therapist_name ?? null,
    amountPaise: includeMoney ? r.amount_paise : null,
    details: r.details ?? null,
    createdAt: r.created_at,
    actorScope: null,
    patientId: r.patient_id,
    patientName: r.patient_name,
    therapistId: r.therapist_id,
    therapistName: r.therapist_name,
    appointmentId: r.appointment_id,
    sessionCode: r.session_code,
    programmeCode: r.programme_code,
    conditionName: r.condition_name,
  };
}

/**
 * Newest user-activity rows, optionally older than a cursor or about one
 * subject (a patient, a therapist or a session by id).
 */
export async function fetchUserActivityRows(
  admin: AdminClient,
  opts: { before?: string | null; limit: number; subjectId?: string | null }
): Promise<{ rows: UserActivityDbRow[]; ok: boolean }> {
  try {
    let query = admin
      .from("user_activity_log")
      .select(USER_ACTIVITY_SELECT)
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (opts.before) query = query.lt("created_at", opts.before);
    if (opts.subjectId) {
      // Checked as a uuid before it is put into the filter string: `or()`
      // takes raw PostgREST syntax, so an unchecked value is an injection.
      if (!UUID_RE.test(opts.subjectId)) return { rows: [], ok: true };
      const id = opts.subjectId;
      query = query.or(
        `patient_id.eq.${id},therapist_id.eq.${id},appointment_id.eq.${id},actor_id.eq.${id}`
      );
    }
    const { data, error } = await query;
    if (error) {
      console.error("user activity log read failed", error.message);
      return { rows: [], ok: false };
    }
    return { rows: (data ?? []) as unknown as UserActivityDbRow[], ok: true };
  } catch (err) {
    console.error("user activity log read threw", err);
    return { rows: [], ok: false };
  }
}

/**
 * Gives admin rows the subjects the feed filters on.
 *
 * An admin entry names the row it acted on (`target_id`) and nothing else,
 * so the patient, the therapist, the programme ID and the condition are
 * found by looking that row up -- whichever of an appointment, a
 * recommendation, a purchase or a profile it turns out to be. Resolved on
 * read rather than stored so the entries written before the feed existed are
 * filterable too, and no admin route has to change.
 */
export async function enrichAdminRows(admin: AdminClient, rows: ActivityRow[]): Promise<ActivityRow[]> {
  const targets = ids(rows.map((r) => r.targetId));
  if (targets.length === 0) return rows;

  const [appointments, plans, packages, visits, profiles] = await Promise.all([
    lookupAppointments(admin, targets),
    lookupCarePlans(admin, targets),
    lookupPackagePurchases(admin, targets),
    lookupHomeVisitPurchases(admin, targets),
    lookupProfiles(admin, targets),
  ]);
  const profileSubject = new Map<string, Subject>();
  for (const p of profiles) {
    if (p.role === "patient") profileSubject.set(p.id, { ...EMPTY_SUBJECT, patientId: p.id });
    else if (p.role === "therapist") profileSubject.set(p.id, { ...EMPTY_SUBJECT, therapistId: p.id });
  }
  const subjectOf = (id: string | null): Subject | null =>
    id
      ? appointments.get(id) ??
        plans.get(id) ??
        packages.get(id) ??
        visits.get(id) ??
        profileSubject.get(id) ??
        null
      : null;

  const resolved = rows.map((r) => ({ row: r, subject: subjectOf(r.targetId) }));
  const people = ids(resolved.flatMap(({ subject }) => [subject?.patientId, subject?.therapistId]));
  const categoryIds = ids(resolved.map(({ subject }) => subject?.categoryId));
  const [named, categories] = await Promise.all([
    people.length > 0 ? lookupProfiles(admin, people) : Promise.resolve([] as ProfileRow[]),
    categoryIds.length > 0 ? lookupCategoryNames(admin, categoryIds) : Promise.resolve(new Map<string, string>()),
  ]);
  const nameById = new Map(named.map((p) => [p.id, p.full_name]));

  return resolved.map(({ row, subject }) => {
    if (!subject) return row;
    return {
      ...row,
      patientId: subject.patientId,
      patientName: subject.patientId ? nameById.get(subject.patientId) ?? null : null,
      therapistId: subject.therapistId,
      therapistName: subject.therapistId ? nameById.get(subject.therapistId) ?? null : null,
      appointmentId: subject.appointmentId,
      sessionCode: subject.sessionCode,
      programmeCode: subject.programmeCode,
      conditionName: subject.categoryId ? categories.get(subject.categoryId) ?? null : null,
    };
  });
}
