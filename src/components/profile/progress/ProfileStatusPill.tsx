import { StatusPill } from "@/components/dashboard/SurfaceCard";
import {
  PROFILE_STATUS_LABEL,
  effectiveStatus,
  statusReasonText,
  type ProfileStatus,
  type StatusOverride,
  type StatusResult,
} from "@/lib/profileStatus";
import type { Voice } from "@/lib/progressView";

const TONE: Record<ProfileStatus, string> = {
  improving: "good",
  steady: "neutral",
  needs_attention: "warn",
  baseline: "info",
  unknown: "neutral",
};

/**
 * Improving / Holding steady / Needs attention, as a pill with its word (never
 * colour alone). `computed` comes from `computeProfileStatus()`; when the
 * physiotherapist has overruled it, `override` wins and the pill says whose
 * judgement it is. `showReason` adds the one sentence that explains the pill
 * - the rule's reason in the viewer's own voice, or the physiotherapist's
 * stored reason for an override.
 */
export default function ProfileStatusPill({
  computed,
  override = null,
  voice,
  showReason = false,
}: {
  computed: StatusResult;
  override?: StatusOverride | null;
  voice: Voice;
  showReason?: boolean;
}) {
  const shown = effectiveStatus(computed, override);
  const reason = shown.overridden ? shown.reasonText : statusReasonText(computed.reason, voice);

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <StatusPill tone={TONE[shown.status]}>
        {PROFILE_STATUS_LABEL[shown.status]}
        {shown.overridden && (
          <span className="font-normal">{voice === "clinician" ? " (set by you)" : " (set by your physiotherapist)"}</span>
        )}
      </StatusPill>
      {showReason && reason && <p className="max-w-prose text-xs text-slate-600">{reason}</p>}
    </div>
  );
}
