import CareStatusControls from "@/components/profile/progress/CareStatusControls";
import type { ActiveOverride } from "@/lib/careStatus";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { WhereThingsStandView } from "@/lib/whereThingsStand";

/**
 * The phase, status and "Where things stand" writing controls for whichever
 * Health Profile this is, or nothing for a viewer whose route would refuse
 * (`canSetStatus` null: absent, not disabled). When the phase and status
 * history could not be read the controls are not mounted at all - changing
 * something on top of a history we could not see is how an overrule gets
 * lost - and a line says why.
 */
export default function ProfileStatusControls({
  patientId,
  profileKind,
  canSetStatus,
  statusFailed,
  phase,
  phaseIsInferred,
  override,
  stand,
}: {
  patientId: string;
  profileKind: ProfileKind;
  canSetStatus: { endpoint: string } | null;
  statusFailed: boolean;
  phase: string | null;
  phaseIsInferred: boolean;
  override: ActiveOverride | null;
  stand: WhereThingsStandView;
}) {
  if (!canSetStatus) return null;
  if (statusFailed) {
    return (
      <p role="status" className="text-xs text-amber-900">
        {"We couldn't read the phase and status history just now, so they can't be changed from here. Reload to try again."}
      </p>
    );
  }
  return (
    <CareStatusControls
      patientId={patientId}
      profileKind={profileKind}
      currentPhase={phase}
      phaseIsInferred={phaseIsInferred}
      override={override ? { status: override.status, reason: override.reason, setAt: override.setAt } : null}
      overrideStale={override?.stale ?? false}
      summary={stand.source === "written" ? { text: stand.text, setAt: stand.setAt } : null}
      summaryDraft={stand.draft}
      endpoint={canSetStatus.endpoint}
    />
  );
}
