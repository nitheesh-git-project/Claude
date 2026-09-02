import { describeVersionChange, parseOfferSnapshot, summariseVersion } from "@/lib/carePlans";
import type { CarePlanHistoryVersion as HistoryRow } from "@/lib/carePlanServer";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Clinician-facing wording. The patient never reads a `pending_review` or
// `rejected` thread at all -- `loadCarePlanHistory` drops those unless the
// caller asks for them -- so these two labels exist for the therapist and
// the admin only, and say plainly who is being waited on.
const PLAN_STATUS_LABELS: Record<string, string> = {
  pending_review: "Waiting for the clinic to approve",
  rejected: "Not approved",
  active: "Waiting on the patient",
  accepted: "Purchased",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
  superseded: "Replaced",
};

/**
 * Every recommendation this patient has ever been given, newest first.
 *
 * Renders out of `care_plan_versions` directly — the same rows the
 * patient's own screen reads. One authoritative record with two readers,
 * rather than a copy per surface: a second copy is a second thing to keep
 * in sync, and clinical history that can drift is not history.
 *
 * A server component. Nothing here is interactive, and nothing here can be
 * edited: a version that changed is a new version, enforced by a trigger,
 * so this is a record rather than a form.
 *
 * `voice` branches the sentences that address someone, the same rule
 * ConditionIntakePanel follows — the clinician reading their own reasoning
 * back and the patient reading what their therapist said about them need
 * different words, and one string cannot be true for both.
 */
export default function CarePlanHistory({
  versions,
  authorNames,
  voice,
}: {
  versions: HistoryRow[];
  /** Therapist id to display name, resolved by the caller. */
  authorNames: Map<string, string>;
  voice: "clinician" | "patient";
}) {
  if (versions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">Treatment recommendations</h2>
        <p className="mt-2 text-xs text-slate-500">
          {voice === "clinician"
            ? "Nothing recommended yet. You can propose a programme from a completed session's note."
            : "Your therapist hasn't recommended a programme yet. They'll do that after seeing how you get on."}
        </p>
      </div>
    );
  }

  // Grouped by thread so a chain of revisions reads as one decision changing
  // its mind, rather than as unrelated recommendations.
  const byPlan = new Map<string, HistoryRow[]>();
  for (const v of versions) {
    const list = byPlan.get(v.planId) ?? [];
    list.push(v);
    byPlan.set(v.planId, list);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">Treatment recommendations</h2>
      <p className="mt-1 text-xs text-slate-500">
        {voice === "clinician"
          ? "Every version, kept. A recommendation that changed is a new version — nothing here is overwritten."
          : "Everything your therapist has recommended, including anything they later changed their mind about."}
      </p>

      <div className="mt-4 space-y-5">
        {[...byPlan.entries()].map(([planId, planVersions]) => {
          // Newest first within a thread, so the current version reads first
          // and the reasoning behind it sits underneath.
          const ordered = [...planVersions].sort((a, b) => b.versionNo - a.versionNo);
          const status = ordered[0]?.planStatus ?? "active";
          return (
            <div key={planId} className="rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-800">
                  {summariseVersion({
                    offer_snapshot: ordered[0].offerSnapshot,
                    frequency_per_week: ordered[0].frequencyPerWeek,
                  })}
                </p>
                <span className="text-[11px] font-semibold text-slate-500">
                  {PLAN_STATUS_LABELS[status] ?? status}
                </span>
              </div>

              <ol className="divide-y divide-slate-100">
                {ordered.map((version, index) => {
                  const snapshot = parseOfferSnapshot(version.offerSnapshot);
                  const previous = ordered[index + 1];
                  const changes = previous
                    ? describeVersionChange(
                        {
                          offer_snapshot: previous.offerSnapshot,
                          hands_on_required: previous.handsOnRequired,
                          frequency_per_week: previous.frequencyPerWeek,
                        },
                        {
                          offer_snapshot: version.offerSnapshot,
                          hands_on_required: version.handsOnRequired,
                          frequency_per_week: version.frequencyPerWeek,
                        }
                      )
                    : [];

                  return (
                    <li key={version.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[11px] font-semibold text-slate-700">
                          {version.versionNo === 1
                            ? "First recommendation"
                            : `Revision ${version.versionNo}`}
                          {version.isCurrent && (
                            <span className="ml-2 text-teal-700">Current</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {authorNames.get(version.authoredBy) ?? "Therapist"} ·{" "}
                          {new Date(version.authoredAt).toLocaleDateString()}
                        </p>
                      </div>

                      {snapshot && (
                        <p className="mt-1 text-[11px] text-slate-600">
                          {snapshot.sessionCount} session
                          {snapshot.sessionCount === 1 ? "" : "s"} ·{" "}
                          {formatInr(snapshot.pricePaise)}
                          {version.frequencyPerWeek
                            ? ` · ${version.frequencyPerWeek} a week`
                            : ""}
                          {version.handsOnRequired ? " · hands-on" : ""}
                        </p>
                      )}

                      {changes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {changes.map((c) => (
                            <li key={c} className="text-[11px] text-amber-700">
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}

                      {version.clinicalRationale && (
                        <p className="mt-1.5 text-[11px] italic text-slate-600">
                          “{version.clinicalRationale}”
                        </p>
                      )}
                      {version.instructions && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {version.instructions}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
