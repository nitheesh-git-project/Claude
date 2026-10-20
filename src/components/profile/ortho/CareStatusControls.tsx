"use client";

import { useId, useRef, useState } from "react";
import Spinner from "@/components/system/Spinner";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { PHASES_BY_PROFILE_KIND } from "@/lib/milestoneTemplates";
import { PROFILE_STATUS_LABEL, STATUS_OVERRIDE_REASON_MAX, STATUS_OVERRIDE_REASON_MIN, type StatusOverride } from "@/lib/profileStatus";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";
import { formatClinicDate } from "@/lib/formatDateTime";
import { CARE_STATUS_SUMMARY_MAX, normaliseSummary } from "@/lib/careStatus";

const FIELD =
  "min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60";

const OVERRIDE_CHOICES: readonly StatusOverride["status"][] = ["improving", "steady", "needs_attention"];

/**
 * The physiotherapist's judgements about where the course is: which
 * phase the patient is in; - when the computed status is wrong for this
 * person - an overrule of it with a reason, or clearing that overrule; and
 * "Where things stand" in their own words (set_summary), the box prefilled
 * with what they last wrote or else the generated wording as a draft.
 * Each is a row in the append-only care_status_events (the route is
 * /api/therapist/care-status/set, or the admin door with `endpoint`). The
 * reason reaches the patient, so the box says so.
 *
 * Disabled only by its own request or by a reason that is too short (a
 * validity gate); the route has the last word and a refusal is said as a
 * sentence (progressErrors.ts) - a 503 is "we couldn't check", never "not
 * allowed". Mounted only for a viewer the route accepts, so the controls are
 * absent rather than disabled for everyone else.
 */
export default function CareStatusControls({
  patientId,
  profileKind,
  currentPhase,
  phaseIsInferred,
  override,
  overrideStale,
  summary = null,
  summaryDraft = null,
  endpoint = "/api/therapist/care-status/set",
}: {
  patientId: string;
  profileKind: ProfileKind;
  currentPhase: string | null;
  phaseIsInferred: boolean;
  override: { status: StatusOverride["status"]; reason: string; setAt: string } | null;
  overrideStale: boolean;
  /** The written summary in force, if any. */
  summary?: { text: string; setAt: string } | null;
  /** The generated wording, offered as a starting point (never saved as is
   *  without the physiotherapist pressing Save). */
  summaryDraft?: string | null;
  endpoint?: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const phases = PHASES_BY_PROFILE_KIND[profileKind];
  const [phase, setPhase] = useState(currentPhase && !phaseIsInferred ? currentPhase : "");
  const [status, setStatus] = useState<StatusOverride["status"] | "">(override?.status ?? "");
  const [reason, setReason] = useState("");
  const [summaryText, setSummaryText] = useState(summary?.text ?? summaryDraft ?? "");
  const summaryClean = normaliseSummary(summaryText);
  const summaryUnchanged = !!summary && summaryClean === summary.text;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const trimmed = reason.replace(/\s+/g, " ").trim();
  const reasonShort = trimmed.length < STATUS_OVERRIDE_REASON_MIN;

  async function send(kind: "phase" | "override" | "clear" | "summary", body: Record<string, unknown>, done: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, ...body }),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), "status"));
        return;
      }
      const data = (await res.json().catch(() => null)) as { unchanged?: boolean } | null;
      show(data?.unchanged ? "Nothing to change - that is already in place" : done);
      if (kind === "override" || kind === "clear") setReason("");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${baseId}-panel`}
        onClick={() => setOpen((v) => !v)}
        className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
      >
        <i aria-hidden className="fa-solid fa-sliders text-xs" />
        Phase and status
      </button>

      {open && (
        <div id={`${baseId}-panel`} className="mt-3 space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (phase) void send("phase", { action: "set_phase", phase }, "Phase saved");
            }}
          >
            <label htmlFor={`${baseId}-phase`} className="block text-sm font-semibold text-slate-900">
              Current phase
            </label>
            <p className="text-xs text-slate-700">
              Moving on follows the criteria in the plan, not the week number.
              {phaseIsInferred && currentPhase ? ` None is set; the plan suggests "${currentPhase}".` : ""}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select id={`${baseId}-phase`} value={phase} onChange={(e) => setPhase(e.target.value)} className={FIELD}>
                <option value="">Choose a phase</option>
                {phases.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!phase || busy !== null}
                className={`${BUTTON} shrink-0 bg-teal-700 text-white hover:bg-teal-800`}
              >
                {busy === "phase" && <Spinner />}
                Save phase
              </button>
            </div>
          </form>

          <form
            className="space-y-2 border-t border-slate-200 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (status && !reasonShort) void send("override", { action: "override_status", status, reason: trimmed }, "Status overruled");
            }}
          >
            <label htmlFor={`${baseId}-status`} className="block text-sm font-semibold text-slate-900">
              Overrule the computed status
            </label>
            <p className="text-xs text-slate-700">
              Use this when the rule is wrong for this person. Your reason is shown to the patient, so write it for them.
            </p>
            {override && (
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-800">
                In force since {formatClinicDate(override.setAt)}: <strong>{PROFILE_STATUS_LABEL[override.status]}</strong> - {override.reason}
                {overrideStale && (
                  <span className="mt-1 block font-semibold text-amber-900">
                    There has been a review since. Look at this again and confirm it, change it, or clear it.
                  </span>
                )}
              </p>
            )}
            <select
              id={`${baseId}-status`}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusOverride["status"] | "")}
              className={FIELD}
            >
              <option value="">Choose a status</option>
              {OVERRIDE_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {PROFILE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <label htmlFor={`${baseId}-reason`} className="block text-sm font-semibold text-slate-900">
              Why
            </label>
            <textarea
              id={`${baseId}-reason`}
              value={reason}
              rows={3}
              maxLength={STATUS_OVERRIDE_REASON_MAX}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              aria-describedby={`${baseId}-reason-hint`}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            />
            <p id={`${baseId}-reason-hint`} className="text-xs text-slate-700">
              {reasonShort
                ? `At least ${STATUS_OVERRIDE_REASON_MIN} characters (${trimmed.length} so far).`
                : `${trimmed.length} of ${STATUS_OVERRIDE_REASON_MAX} characters.`}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={!status || reasonShort || busy !== null}
                className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800`}
              >
                {busy === "override" && <Spinner />}
                Save overrule
              </button>
              {override && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send("clear", { action: "clear_override" }, "Overrule cleared")}
                  className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
                >
                  {busy === "clear" && <Spinner />}
                  Clear the overrule
                </button>
              )}
            </div>
          </form>

          <form
            className="space-y-2 border-t border-slate-200 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (summaryClean && !summaryUnchanged) void send("summary", { action: "set_summary", text: summaryClean }, "Summary saved");
            }}
          >
            <label htmlFor={`${baseId}-summary`} className="block text-sm font-semibold text-slate-900">
              Where things stand
            </label>
            <p id={`${baseId}-summary-hint`} className="text-xs text-slate-700">
              {summary
                ? `Last written ${formatClinicDate(summary.setAt)}. A new version replaces it on the patient's screen; the old one is kept.`
                : summaryDraft
                  ? "Started for you from the numbers - change it into your own words before saving. The patient reads this."
                  : "A few plain sentences for the patient: how they are doing and what comes next."}
            </p>
            <textarea
              id={`${baseId}-summary`}
              value={summaryText}
              rows={4}
              maxLength={CARE_STATUS_SUMMARY_MAX + 200}
              onChange={(e) => {
                setSummaryText(e.target.value);
                setError(null);
              }}
              aria-describedby={`${baseId}-summary-hint ${baseId}-summary-count`}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            />
            <p id={`${baseId}-summary-count`} className="text-xs text-slate-700">
              {summaryClean.length} of {CARE_STATUS_SUMMARY_MAX} characters.
            </p>
            <button
              type="submit"
              disabled={!summaryClean || summaryClean.length > CARE_STATUS_SUMMARY_MAX || summaryUnchanged || busy !== null}
              className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800`}
            >
              {busy === "summary" && <Spinner />}
              Save summary
            </button>
          </form>

          {error && (
            <p role="alert" data-form-error className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
