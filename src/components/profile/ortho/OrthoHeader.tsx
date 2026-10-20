import type { ReactNode } from "react";
import PhaseBar from "@/components/profile/progress/PhaseBar";
import ProfileStatusPill from "@/components/profile/progress/ProfileStatusPill";
import WhereThingsStand from "@/components/profile/progress/WhereThingsStand";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { ActiveOverride } from "@/lib/careStatus";
import type { StatusResult } from "@/lib/profileStatus";
import type { Voice } from "@/lib/progressView";
import type { WhereThingsStandView } from "@/lib/whereThingsStand";

/**
 * The top of the orthopaedic profile: who and what (name, condition line,
 * the condition-type chip), the status pill (the computed status, or the
 * physiotherapist's overrule with its reason), the four-stage phase bar and
 * "Where things stand".
 *
 * An override whose read failed is not drawn as "no override": the pill is
 * the computed status plus a line saying the physiotherapist's view could
 * not be checked (`statusFailed`). A phase the physiotherapist has not set
 * is marked as the plan's suggestion, never presented as theirs.
 */
export default function OrthoHeader({
  voice,
  name,
  conditionLine,
  chipLabel,
  computed,
  override,
  phase,
  phaseIsInferred,
  statusFailed,
  stand,
  lastReviewAt,
  controls,
}: {
  voice: Voice;
  name: string;
  /** "Right knee pain after a fall" - the patient's own words, or null. */
  conditionLine: string | null;
  chipLabel: string;
  computed: StatusResult;
  override: ActiveOverride | null;
  phase: string | null;
  phaseIsInferred: boolean;
  statusFailed: boolean;
  /** "Where things stand", shaped by whereThingsStand.ts. */
  stand: WhereThingsStandView;
  lastReviewAt: string | null;
  /** The physiotherapist's phase and status controls, when the viewer may use them. */
  controls?: ReactNode;
}) {
  const clinician = voice === "clinician";
  return (
    <div className="space-y-4">
      <header className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 [overflow-wrap:anywhere]">{name}</h2>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
                {chipLabel}
              </span>
            </div>
            {conditionLine && <p className="mt-1.5 text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{conditionLine}</p>}
            <div className="mt-3">
              <ProfileStatusPill
                computed={computed}
                override={override ? { status: override.status, reason: override.reason } : null}
                voice={voice}
                showReason
              />
              {override?.stale && clinician && (
                <p role="status" className="mt-1.5 text-xs font-semibold text-amber-900">
                  There has been a review since you overruled this. Look at it again.
                </p>
              )}
              {statusFailed && (
                <p role="status" className="mt-1.5 text-xs text-amber-900">
                  {"We couldn't check whether your physiotherapist has overruled this status, so the computed one is shown."}
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-slate-700">
              <span>
                <strong className="text-slate-900">{phase ?? "Phase not set"}</strong>
                {phaseIsInferred && phase ? " (suggested by the plan)" : ""}
              </span>
              {lastReviewAt && <span>Last review {formatClinicDate(lastReviewAt)}</span>}
            </div>
            <PhaseBar profileKind="ortho" currentPhase={phase} voice={voice} />
          </div>
        </div>
        {controls && <div className="mt-4 border-t border-slate-100 pt-4">{controls}</div>}
      </header>

      <WhereThingsStand view={stand} voice={voice} loadFailed={statusFailed} />
    </div>
  );
}
