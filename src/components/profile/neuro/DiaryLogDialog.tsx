"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import DateField from "@/components/system/DateField";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import { clinicDateKey } from "@/lib/clinicWeek";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import {
  DIARY_BACKDATE_MAX_DAYS,
  DIARY_KIND_LABEL,
  DIARY_NOTE_MAX,
  DIARY_PLACES,
  ACTIVITY_INTENSITIES,
  DIARY_ACTIVE_MINUTES_MAX,
  FREEZING_PERIODS,
  FREEZING_TRIGGERS,
  type DiaryKind,
} from "@/lib/patientDiary";
import {
  INTENSITY_LABEL,
  MEDICATION_STATE_LABEL,
  PERIOD_LABEL,
  PLACE_LABEL,
  buildDiaryRequest,
  emptyDiaryDraft,
  offeredDiaryKinds,
  type DiaryDraft,
} from "@/lib/patientDiaryForm";
import { FREEZING_TRIGGER_LABEL } from "@/lib/neuroProfile";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";

const FIELD =
  "min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

const KIND_HELP: Record<DiaryKind, string> = {
  freezing: "Your feet feel stuck to the floor. Add up a day or a week if you would rather tell us once.",
  fall: "You ended up on the floor or the ground.",
  near_miss: "You caught yourself, or someone caught you, before you fell.",
  active_minutes: "Time spent walking, cycling or doing your exercises.",
};

/**
 * "Log feet getting stuck, a fall or a near miss": the patient's own diary
 * entry (or the family member's, holding their phone). Offers only the kinds
 * their record keeps (`offeredDiaryKinds`, which is `diaryKindsFor` - the
 * server refuses the rest), checks the entry with the route's own rules
 * before the round trip, and says every refusal as a sentence
 * (progressErrorMessage, "diary"): a 503 is "nothing was saved", a 429 is
 * "wait", never "not allowed". Real radio buttons and 44 px targets; the
 * entry is the patient's account and says so - their physiotherapist reads
 * it and may confirm it.
 */
export default function DiaryLogDialog({
  profileKind,
  initialKind,
  onClose,
}: {
  profileKind: ProfileKind;
  initialKind?: DiaryKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const titleId = useId();
  const baseId = useId();
  const kinds = useMemo(() => offeredDiaryKinds(profileKind), [profileKind]);
  const parkinsons = profileKind === "neuro_parkinsons";
  // The form is dated by the real clock, as the table's own CHECK is.
  const [startMs] = useState(() => Date.now());
  const [draft, setDraft] = useState<DiaryDraft>(() => emptyDiaryDraft(startMs, initialKind && kinds.includes(initialKind) ? initialKind : kinds.length === 1 ? kinds[0] : ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const savingRef = useRef(false);
  const clean = useMemo(() => emptyDiaryDraft(startMs, draft.kind), [startMs, draft.kind]);
  const dirty = JSON.stringify({ ...draft, kind: "" }) !== JSON.stringify({ ...clean, kind: "" });

  function requestClose() {
    if (saving) return;
    if (dirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }
  const { panelRef, dialogProps } = useDialogChrome({ onClose: requestClose, labelledBy: titleId });

  function patch(p: Partial<DiaryDraft>) {
    setConfirmingDiscard(false);
    setError(null);
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save() {
    if (savingRef.current) return;
    const built = buildDiaryRequest(draft, { profileKind, nowMs: Date.now() });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/diary/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.body),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), "diary"));
        return;
      }
      const data = (await res.json().catch(() => null)) as { duplicate?: boolean } | null;
      show(data?.duplicate ? "That was already saved." : "Saved in your diary. Your physiotherapist will see it.");
      onClose();
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const minDate = clinicDateKey(startMs - DIARY_BACKDATE_MAX_DAYS * 86_400_000);

  const choice = (name: string, value: string, current: string, label: string, onPick: () => void, hint?: string): ReactNode => (
    <label
      key={`${name}-${value}`}
      className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm text-slate-900 ${
        current === value ? "border-teal-700 bg-teal-50" : "border-slate-300 bg-white"
      } focus-within:ring-2 focus-within:ring-teal-600`}
    >
      <input type="radio" name={`${baseId}-${name}`} value={value} checked={current === value} onChange={onPick} className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-700">{hint}</span>}
      </span>
    </label>
  );

  const group = (legend: string, children: ReactNode, optional = false) => (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-semibold text-slate-900">
        {legend}
        {optional && <span className="ml-1.5 text-xs font-normal text-slate-700">(if you know)</span>}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );

  const stateGroup = group(
    "Was your medicine working?",
    (["on", "off", "not_sure"] as const).map((v) => choice("med", v, draft.medicationState, MEDICATION_STATE_LABEL[v], () => patch({ medicationState: v }))),
    true
  );
  const placeGroup = group(
    "Where were you?",
    DIARY_PLACES.map((v) => choice("place", v, draft.place, PLACE_LABEL[v], () => patch({ place: v }))),
    true
  );

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          ref={panelRef}
          {...dialogProps}
          className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[92vh] sm:max-w-2xl sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">Your diary</p>
              <h2 id={titleId} className="font-display text-lg font-bold text-slate-900">
                Write something down
              </h2>
              <p className="mt-0.5 text-xs text-slate-700">
                This is your own account. Your physiotherapist reads it and can confirm they have seen it; it is never changed afterwards.
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i aria-hidden className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            {kinds.length === 0 ? (
              <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                Your physiotherapist has not asked you to keep a diary yet. Tell them at your next session if something has happened.
              </p>
            ) : (
              <>
                {kinds.length > 1 &&
                  group(
                    "What happened?",
                    kinds.map((k) => choice("kind", k, draft.kind, DIARY_KIND_LABEL[k].patient, () => patch({ kind: k }), KIND_HELP[k]))
                  )}

                {draft.kind && (
                  <>
                    <div className="min-w-0">
                      <span id={`${baseId}-when`} className="block text-sm font-semibold text-slate-900">
                        When?
                      </span>
                      <div className="mt-2">
                        {/* The app's own date control (a native date or time box
                            is not used anywhere): it hands back YYYY-MM-DDTHH:mm in
                            the clinic's clock, which is what the form holds. */}
                        <DateField
                          withTime
                          clearable={false}
                          value={`${draft.date}T${draft.time}`}
                          onChange={(next) => {
                            const [date, time] = next.split("T");
                            if (date && time) patch({ date, time });
                          }}
                          ariaLabel="When did it happen"
                          dialogTitle="When did it happen?"
                          minDateKey={minDate}
                          maxToday
                          placeholder="Choose the day and time"
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-700">Already filled in as now. Change it if it was earlier - up to {DIARY_BACKDATE_MAX_DAYS} days ago.</p>
                    </div>

                    {draft.kind === "freezing" && (
                      <>
                        {group(
                          "How much are you writing down?",
                          FREEZING_PERIODS.map((v) => choice("period", v, draft.period, PERIOD_LABEL[v], () => patch({ period: v })))
                        )}
                        {(draft.period === "day" || draft.period === "week") && (
                          <label className="block text-sm text-slate-900">
                            <span className="font-semibold">How many times did your feet get stuck?</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              value={draft.count}
                              onChange={(e) => patch({ count: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                              className={`mt-1 ${FIELD}`}
                              placeholder="e.g. 6"
                            />
                          </label>
                        )}
                        {group(
                          "What was happening?",
                          FREEZING_TRIGGERS.map((v) => choice("trigger", v, draft.trigger, FREEZING_TRIGGER_LABEL[v], () => patch({ trigger: v }))),
                          true
                        )}
                        {stateGroup}
                      </>
                    )}

                    {draft.kind === "fall" && (
                      <>
                        {group("Were you hurt?", [
                          choice("injured", "no", draft.injured, "No, I was not hurt", () => patch({ injured: "no" })),
                          choice("injured", "yes", draft.injured, "Yes, I was hurt", () => patch({ injured: "yes" })),
                        ])}
                        {group(
                          "Could you get up on your own?",
                          [
                            choice("gotup", "yes", draft.gotUp, "Yes", () => patch({ gotUp: "yes" })),
                            choice("gotup", "no", draft.gotUp, "No, I needed help", () => patch({ gotUp: "no" })),
                          ],
                          true
                        )}
                        {placeGroup}
                        {parkinsons && stateGroup}
                      </>
                    )}

                    {draft.kind === "active_minutes" && (
                      <>
                        <label className="block text-sm text-slate-900">
                          <span className="font-semibold">How many minutes?</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={draft.minutes}
                            onChange={(e) => patch({ minutes: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                            className={`mt-1 max-w-xs ${FIELD}`}
                            placeholder="e.g. 20"
                            aria-describedby={`${baseId}-minutes-hint`}
                          />
                          <span id={`${baseId}-minutes-hint`} className="mt-0.5 block text-xs text-slate-700">
                            Whole minutes, up to {DIARY_ACTIVE_MINUTES_MAX}. Add up a walk or a session; write a long day in more than one go if you like.
                          </span>
                        </label>
                        {group(
                          "How did it feel?",
                          ACTIVITY_INTENSITIES.map((v) => choice("intensity", v, draft.intensity, INTENSITY_LABEL[v].label, () => patch({ intensity: v }), INTENSITY_LABEL[v].hint)),
                          true
                        )}
                      </>
                    )}

                    {draft.kind === "near_miss" && (
                      <>
                        {placeGroup}
                        {parkinsons && stateGroup}
                      </>
                    )}

                    <label className="block text-sm text-slate-900">
                      <span className="font-semibold">Anything else you want them to know?</span>
                      <span className="ml-1.5 text-xs font-normal text-slate-700">(optional)</span>
                      <textarea
                        value={draft.note}
                        maxLength={DIARY_NOTE_MAX}
                        rows={3}
                        onChange={(e) => patch({ note: e.target.value })}
                        className="mt-1 min-h-[88px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                      />
                      <span className="mt-0.5 block text-xs text-slate-700">Your physiotherapist reads this. {draft.note.length} of {DIARY_NOTE_MAX}.</span>
                    </label>
                  </>
                )}
              </>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-100 px-4 py-3 sm:px-6">
            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              {confirmingDiscard ? (
                <>
                  <p className="mr-auto text-xs text-slate-700">Throw away what you wrote?</p>
                  <button type="button" onClick={() => setConfirmingDiscard(false)} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    Keep writing
                  </button>
                  <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                    Throw away
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={requestClose} disabled={saving} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || kinds.length === 0}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {saving && <Spinner />}
                    {saving ? "Saving…" : "Save in my diary"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
