import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStartedSessionWithPatient, isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { formatClinicTime } from "@/lib/formatDateTime";
import { loadEnabledLicensedMeasures, loadMeasurements, loadPatientProfileKind } from "@/lib/outcomeServer";
import { parseMeasurementRows, buildMeasureSeries } from "@/lib/outcomeSeries";
import { protocolsForProfileKind, sessionProtocol } from "@/lib/sessionProtocols";
import { loadActiveRun, loadRunMeasurements } from "@/lib/assessmentRunServer";
import { loadActiveExercisePlan, loadPatientExerciseContext, loadTeachingEvents } from "@/lib/exercisePlanServer";
import { CONTRA_FLAGS } from "@/lib/exerciseLibrary";
import SessionCockpit from "@/components/therapist/assessment/SessionCockpit";
import StartPanel from "@/components/therapist/assessment/StartPanel";

export const metadata: Metadata = {
  title: "Guided assessment | MoveRestore",
};

// The session cockpit (Health Profile redesign, phase 7b): the therapist's
// second screen next to Google Meet for the guided video assessment. Guarded
// like the chart: reaching it needs the therapist to be assigned to this
// patient (clinical access), and anything else is a 404, never a hint that the
// patient exists. The started-session half is the start route's and the
// event routes' to judge, on the debug bar's clock; this page only says so
// when it can see the session has not begun. A read that could not be run is
// said as "we couldn't check", never as "none" or "not allowed".

// A clock read behind a function: the page reads "now" once per request.
function nowTimestamp() {
  return Date.now();
}

function Notice({ title, children, back }: { title: string; children: ReactNode; back: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="cockpit-notice-page">
      <h1 className="font-display text-xl font-extrabold text-slate-900">{title}</h1>
      <div className="space-y-2 text-base text-slate-800">{children}</div>
      <Link
        href={back}
        className="inline-flex min-h-[48px] items-center rounded-xl border border-slate-300 px-5 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        Back to the chart
      </Link>
    </div>
  );
}

export default async function AssessmentCockpitPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { patientId } = await params;
  const query = await searchParams;
  const appointmentParam = typeof query.appointment === "string" && query.appointment ? query.appointment : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const chartHref = `/therapist/dashboard/health-profile/${patientId}`;
  const [assigned, { data: patient }, { data: settingsRow }] = await Promise.all([
    isTherapistAssignedToPatient(admin, user.id, patientId),
    admin.from("profiles").select("id, full_name").eq("id", patientId).eq("role", "patient").maybeSingle(),
    supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
  ]);
  if (assigned === null) {
    return (
      <main className="min-h-screen bg-slate-50 p-3 sm:p-6">
        <Notice title="We couldn't check" back="/therapist/dashboard">
          <p>We could not check whether this patient is yours just now, so nothing is shown. Please try again in a moment.</p>
        </Notice>
      </main>
    );
  }
  if (!patient || !assigned) notFound();
  const patientName = (patient.full_name as string | null) ?? "Patient";

  const [kind, active] = await Promise.all([loadPatientProfileKind(admin, patientId), loadActiveRun(admin, patientId)]);

  let body: ReactNode;
  if (active.status === "not_migrated") {
    body = (
      <Notice title="Not available yet" back={chartHref}>
        <p>The guided assessment is not set up on this database yet. Ask the clinic to apply the latest schema.</p>
      </Notice>
    );
  } else if (active.status === "unreadable") {
    body = (
      <Notice title="We couldn't check" back={chartHref}>
        <p>We could not check whether an assessment is already open for {patientName}, so we have not started a second one. Please try again in a moment.</p>
      </Notice>
    );
  } else if (active.run && active.run.therapistId !== user.id) {
    body = (
      <Notice title="Another physiotherapist is running it" back={chartHref}>
        <p>Another physiotherapist has a guided assessment open for {patientName} right now. Only one can run at a time.</p>
      </Notice>
    );
  } else if (active.run) {
    const run = active.run;
    const protocol = sessionProtocol(run.protocolKey);
    const [measurementsRead, savedRead, licensed, planRead, marksRead, exerciseContext] = await Promise.all([
      loadMeasurements(admin, patientId),
      loadRunMeasurements(admin, active.events),
      loadEnabledLicensedMeasures(admin),
      loadActiveExercisePlan(admin, patientId),
      loadTeachingEvents(admin, run.id),
      loadPatientExerciseContext(admin, patientId, nowTimestamp()),
    ]);
    // The Home exercises step: a read that could not be run is said as such,
    // never as "no plan yet".
    const exercises: ComponentProps<typeof SessionCockpit>["exercises"] =
      planRead.status === "not_migrated" || marksRead.status === "not_migrated"
        ? { loadStatus: "not_migrated", plan: null, marks: [], contraFlags: [] }
        : planRead.status !== "ok" || marksRead.status !== "ok" || exerciseContext.status !== "ok"
          ? { loadStatus: "unreadable", plan: null, marks: [], contraFlags: [] }
          : {
              loadStatus: "ok",
              plan: planRead.plan
                ? { id: planRead.plan.id, version: planRead.plan.version, items: planRead.plan.items.map((i) => ({ exerciseKey: i.exerciseKey, dose: i.dose })) }
                : null,
              marks: marksRead.events,
              contraFlags: CONTRA_FLAGS.filter((f) => exerciseContext.contraFlags.has(f)),
            };
    // The session this run is filed against, for the header line.
    const apptId = run.appointmentId ?? appointmentParam;
    const { data: appt } = apptId
      ? await admin.from("appointments").select("id, patient_id, therapist_id, slot_time, concern").eq("id", apptId).maybeSingle()
      : { data: null };
    const own = appt && appt.patient_id === patientId && appt.therapist_id === user.id ? appt : null;
    const headline = [
      (own?.concern as string | null) ?? (protocol ? protocol.title : "Guided assessment"),
      "Video",
      own?.slot_time ? formatClinicTime(own.slot_time as string) : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const points = measurementsRead.status === "ok" ? parseMeasurementRows(measurementsRead.rows as unknown as unknown[]) : [];
    // "Last time" beside a reading: what was on the record before today's run.
    const before = points.filter((p) => Date.parse(p.createdAt) < Date.parse(run.startedAt));
    body = (
      <SessionCockpit
        patient={{ id: patientId, name: patientName }}
        headline={headline}
        run={run}
        events={active.events}
        measurements={savedRead.status === "ok" ? savedRead.measurements : []}
        series={buildMeasureSeries(before, { profileKind: run.profileKind })}
        profileKind={run.profileKind}
        enabledLicensed={licensed.status === "ok" ? licensed.keys : []}
        licenceUnreadable={licensed.status !== "ok"}
        chartHref={chartHref}
        exercises={exercises}
      />
    );
    if (savedRead.status !== "ok" || measurementsRead.status !== "ok") {
      body = (
        <div className="space-y-3">
          <p role="status" data-testid="cockpit-read-warning" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            {savedRead.status !== "ok"
              ? "We couldn't load the readings already saved in this assessment, so today's results may look shorter than they are. Reload to try again."
              : "We couldn't load the earlier readings, so \"last time\" is not shown beside new ones. Reload to try again."}
          </p>
          {body}
        </div>
      );
    }
  } else if (kind.status === "unreadable") {
    body = (
      <Notice title="We couldn't check" back={chartHref}>
        <p>We could not check {patientName}{"'"}s condition type just now, so no assessment was offered. Please try again in a moment.</p>
      </Notice>
    );
  } else if (kind.status === "no_profile") {
    body = (
      <Notice title="Record the condition type first" back={chartHref}>
        <p>{patientName}{"'"}s condition type has not been recorded yet, so there is no assessment to run. Record it on their Health Profile first.</p>
      </Notice>
    );
  } else {
    const adminSettings = parseAdminSettings(settingsRow);
    const started = await hasStartedSessionWithPatient(admin, user.id, patientId, adminSettings.joinWindowMinutes, nowTimestamp());
    const sessionNote =
      started === null
        ? "We couldn't check whether your session has started. You can still try to start; the check is made again when you do."
        : started
          ? null
          : "Your session with this patient has not started yet. The assessment opens once it begins.";
    body = (
      <StartPanel
        patientId={patientId}
        patientName={patientName}
        appointmentId={appointmentParam}
        protocols={protocolsForProfileKind(kind.profileKind).map((p) => ({ key: p.key, title: p.title }))}
        sessionNote={sessionNote}
        chartHref={chartHref}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 pb-6 sm:p-6">
      <div className="mx-auto w-full max-w-[1400px]">{body}</div>
    </main>
  );
}
