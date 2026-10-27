import { subjectWords, type ProfileSubject } from "@/lib/childVoice";
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
 * judgement it is -- unless a fall or red flag came AFTER the override, which
 * the override never hides (profileStatus.ts `effectiveStatus`). `showReason` adds the one sentence that explains the pill
 * - the rule's reason in the viewer's own voice, or the physiotherapist's
 * stored reason for an override.
 */
export default function ProfileStatusPill({
  computed,
  override = null,
  voice,
  subject = "self",
  showReason = false,
}: {
  /** Who the patient-voice sentences are about (childVoice.ts): "child" speaks to a parent ("your child's ..."). */
  subject?: ProfileSubject;
  computed: StatusResult;
  override?: StatusOverride | null;
  voice: Voice;
  showReason?: boolean;
}) {
  const w = subjectWords(subject, voice);
  const shown = effectiveStatus(computed, override);
  const reason = shown.overridden ? shown.reasonText : w(statusReasonText(computed.reason, voice));

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <StatusPill tone={TONE[shown.status]}>
        {PROFILE_STATUS_LABEL[shown.status]}
        {shown.overridden && (
          <span className="font-normal">{voice === "clinician" ? " (set by you)" : w(" (set by your physiotherapist)")}</span>
        )}
      </StatusPill>
      {showReason && reason && <p className="max-w-prose text-xs text-slate-600">{reason}</p>}
      {shown.overrideSuperseded && voice === "clinician" && (
        <p role="status" className="max-w-prose text-xs font-semibold text-amber-900">
          {computed.reason === "new_fall"
            ? "A fall was recorded after you overruled this status, so the computed status is shown. Review it, then overrule again if you still disagree."
            : "A red flag was raised after you overruled this status, so the computed status is shown. Review it, then overrule again if you still disagree."}
        </p>
      )}
    </div>
  );
}
