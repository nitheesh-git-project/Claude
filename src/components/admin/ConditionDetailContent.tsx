import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ConditionRequestActions from "@/components/admin/ConditionRequestActions";
import ConditionAccessActions from "@/components/admin/ConditionAccessActions";
import ConditionDirectEditForm from "@/components/admin/ConditionDirectEditForm";
import PainMapQuestionEditor from "@/components/admin/PainMapQuestionEditor";
import { INTAKE_QUESTIONS, CONDITION_STATUS_LABEL, type ConditionProfileStatus } from "@/lib/conditionIntake";
import { PAIN_MAP_REGIONS, painBand, painTrend, PAIN_BAND_LABEL, type QuestionOverrideRow } from "@/lib/painMap";

const PAIN_BAND_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  mid: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

// Shared body for both the standalone /admin/dashboard/conditions/[id]
// page and its @modal intercepted overlay — same split as
// PatientDetailContent for the same reason (Bug 10).
export default async function ConditionDetailContent({ id }: { id: string }) {
  const admin = createAdminClient();

  const [{ data: patient }, { data: profile }, { data: changeRequests }, { data: grants }, { data: assessments }, { data: overrideRows }] =
    await Promise.all([
      admin.from("profiles").select("id, full_name, email").eq("id", id).eq("role", "patient").single(),
      admin
        .from("patient_condition_profiles")
        .select("data, status, updated_at, last_submitted_role")
        .eq("patient_id", id)
        .maybeSingle(),
      admin
        .from("condition_change_requests")
        .select("id, submitted_by, submitted_by_role, proposed_data, status, admin_notes, created_at")
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("condition_access_grants")
        .select("id, therapist_id, status, requested_at, decided_at")
        .eq("patient_id", id)
        .order("requested_at", { ascending: false }),
      admin
        .from("pain_assessments")
        .select("id, region, side, pain_percent, submitted_by_role, created_at")
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
      admin.from("pain_map_question_templates").select("region, question_key, question_text"),
    ]);

  if (!patient) {
    notFound();
  }

  const therapistIds = [...new Set((grants ?? []).map((g) => g.therapist_id))];
  const { data: therapists } =
    therapistIds.length > 0
      ? await admin.from("profiles").select("id, full_name").in("id", therapistIds)
      : { data: [] as { id: string; full_name: string }[] };
  const therapistNameById = new Map((therapists ?? []).map((t) => [t.id, t.full_name]));

  const status = (profile?.status ?? "not_started") as ConditionProfileStatus;
  const currentData = (profile?.data ?? {}) as Record<string, string>;
  const pendingRequest = (changeRequests ?? []).find((r) => r.status === "pending");
  const requestHistory = (changeRequests ?? []).filter((r) => r.status !== "pending");

  const requestedGrants = (grants ?? []).filter((g) => g.status === "requested");
  const approvedGrants = (grants ?? []).filter((g) => g.status === "approved");

  // Latest + previous assessment per (region, side), for the trend arrow.
  const byRegionSide = new Map<string, typeof assessments>();
  for (const a of assessments ?? []) {
    const key = `${a.region}:${a.side}`;
    const list = byRegionSide.get(key) ?? [];
    list.push(a);
    byRegionSide.set(key, list);
  }
  const overridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of overrideRows ?? []) {
    (overridesByRegion[row.region] ??= []).push(row);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{patient.full_name}</h1>
        <p className="text-xs text-slate-500">{patient.email}</p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-slate-800">Patient Care Intake</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {CONDITION_STATUS_LABEL[status]}
          </span>
        </div>

        {pendingRequest && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800 mb-2">
              Submitted by {pendingRequest.submitted_by_role} —{" "}
              {new Date(pendingRequest.created_at).toLocaleString()}
            </p>
            <dl className="space-y-1 mb-3">
              {INTAKE_QUESTIONS.map((q) => {
                const value = (pendingRequest.proposed_data as Record<string, string>)[q.key];
                if (!value) return null;
                return (
                  <div key={q.key} className="text-xs">
                    <dt className="font-semibold text-slate-600">{q.label}</dt>
                    <dd className="text-slate-700">{value}</dd>
                  </div>
                );
              })}
            </dl>
            <ConditionRequestActions requestId={pendingRequest.id} />
          </div>
        )}

        <p className="text-xs font-semibold text-slate-500 mb-2">Current (approved) data — admin can edit directly</p>
        <ConditionDirectEditForm patientId={id} currentData={currentData} />

        {requestHistory.length > 0 && (
          <details className="mt-5">
            <summary className="text-xs font-semibold text-slate-500 cursor-pointer">
              Review history ({requestHistory.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {requestHistory.map((r) => (
                <li key={r.id} className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                  {r.status === "approved" ? "Approved" : "Declined"} — submitted by {r.submitted_by_role},{" "}
                  {new Date(r.created_at).toLocaleString()}
                  {r.admin_notes && <p className="text-slate-500">Note: {r.admin_notes}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Therapist Access</h2>
        {requestedGrants.length === 0 && approvedGrants.length === 0 ? (
          <p className="text-xs text-slate-500">No therapist has requested access to this patient&apos;s condition data.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...requestedGrants, ...approvedGrants].map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {therapistNameById.get(g.therapist_id) ?? g.therapist_id}
                  </p>
                  <p className="text-xs text-slate-400">
                    {g.status === "requested" ? "Requested" : "Approved"} —{" "}
                    {new Date(g.requested_at).toLocaleString()}
                  </p>
                </div>
                <ConditionAccessActions grantId={g.id} status={g.status as "requested" | "approved"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Pain Map</h2>
        {byRegionSide.size === 0 ? (
          <p className="text-xs text-slate-500 mb-4">No pain assessments recorded yet.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
            {PAIN_MAP_REGIONS.flatMap((r) => {
              const sides = r.paired ? ["left", "right"] : ["na"];
              return sides.map((side) => {
                const list = byRegionSide.get(`${r.key}:${side}`);
                if (!list || list.length === 0) return null;
                const latest = list[0];
                const previous = list[1] ?? null;
                const band = painBand(latest.pain_percent);
                const trend = painTrend(latest.pain_percent, previous?.pain_percent ?? null);
                return (
                  <li
                    key={`${r.key}:${side}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-slate-700">
                      {r.label}
                      {r.paired && side !== "na" ? ` (${side})` : ""}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAIN_BAND_STYLE[band]}`}
                    >
                      {latest.pain_percent}% · {PAIN_BAND_LABEL[band]}
                      {trend === "down" && " ↓"}
                      {trend === "up" && " ↑"}
                    </span>
                  </li>
                );
              });
            })}
          </ul>
        )}

        <details>
          <summary className="text-xs font-semibold text-slate-500 cursor-pointer">
            Edit Pain Map question wording
          </summary>
          <div className="mt-3">
            <PainMapQuestionEditor overridesByRegion={overridesByRegion} />
          </div>
        </details>
      </section>
    </div>
  );
}
