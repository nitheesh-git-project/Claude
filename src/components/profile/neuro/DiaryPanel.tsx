"use client";

import { useRef, useState } from "react";
import DiaryLogDialog from "@/components/profile/neuro/DiaryLogDialog";
import Spinner from "@/components/system/Spinner";
import { formatClinicDate, formatClinicDateShort, formatClinicDateTime } from "@/lib/formatDateTime";
import type { FreezingBar } from "@/lib/neuroProfile";
import type { NeuroDiaryView } from "@/lib/neuroProfileView";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import { diaryProvenance, diaryProvenanceLabel, type DiaryEntry } from "@/lib/patientDiary";
import { diaryEntrySummary, offeredDiaryKinds } from "@/lib/patientDiaryForm";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";
import { plural } from "@/lib/neuroProfile";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import type { Voice } from "@/lib/progressView";

const CARD = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const RECENT = 6;

/** The log button's own words, from the kinds the record keeps. */
function logLabel(kinds: readonly string[]): string {
  const words = kinds.map((k) => (k === "freezing" ? "feet getting stuck" : k === "fall" ? "a fall" : k === "active_minutes" ? "your active minutes" : "a near miss"));
  if (words.length <= 1) return `Log ${words[0] ?? "something"}`;
  return `Log ${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/**
 * Twelve clinic weeks of freezing, one bar a week. A week nobody wrote in is a
 * dashed baseline with no bar - "nothing written down", never "no freezing" -
 * and the week still in progress is drawn lighter and labelled as unfinished.
 * Under each written week a dot says whose word it is: open for the patient's
 * own account, filled once a physiotherapist has confirmed every entry in it.
 * The chart is one labelled image with the same weeks in a table for a screen
 * reader.
 */
function FreezingChart({ bars, voice }: { bars: FreezingBar[]; voice: Voice }) {
  const W = 320;
  const H = 150;
  const pad = { top: 16, right: 8, bottom: 34, left: 24 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(4, ...bars.map((b) => b.episodes));
  const slot = plotW / bars.length;
  const barW = Math.min(18, slot - 6);
  const written = bars.filter((b) => b.written);
  const summary =
    written.length === 0
      ? "No freezing has been written down in the last twelve weeks."
      : `Freezing episodes a week over the last twelve weeks: ${written.map((b) => `${b.episodes} in the week of ${formatClinicDateShort(b.weekStart)}`).join(", ")}. Weeks with nothing written down are blank.`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={summary}>
        {[0, 0.5, 1].map((f) => {
          const y = pad.top + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.left - 5} y={y + 3} textAnchor="end" fontSize={9} fill="var(--chart-axis)">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        {bars.map((b, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const h = b.written ? Math.max(3, (b.episodes / max) * plotH) : 0;
          const y = pad.top + plotH - h;
          return (
            <g key={b.weekStart}>
              {b.written ? (
                <rect x={cx - barW / 2} y={y} width={barW} height={h} rx={2} fill="var(--chart-brand-soft)" fillOpacity={b.partial ? 0.45 : 1} />
              ) : (
                <line x1={cx - barW / 2} x2={cx + barW / 2} y1={pad.top + plotH - 1} y2={pad.top + plotH - 1} stroke="var(--chart-axis)" strokeWidth={1.5} strokeDasharray="2 3" />
              )}
              {b.written && (
                <text x={cx} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--chart-ink)">
                  {b.episodes}
                </text>
              )}
              {b.written && (
                <circle
                  cx={cx}
                  cy={pad.top + plotH + 9}
                  r={3.5}
                  fill={b.confirmed ? "var(--chart-brand)" : "none"}
                  stroke="var(--chart-brand)"
                  strokeWidth={1.5}
                />
              )}
              {(i === 0 || i === bars.length - 1 || i === Math.floor(bars.length / 2)) && (
                <text x={cx} y={H - 6} textAnchor={i === 0 ? "start" : i === bars.length - 1 ? "end" : "middle"} fontSize={9} fill="var(--chart-axis)">
                  {formatClinicDateShort(b.weekStart)}
                  {b.partial ? " (so far)" : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="sr-only">
        <table>
          <caption>Freezing episodes written down, by week</caption>
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col">Episodes</th>
              <th scope="col">Whose account</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.weekStart}>
                <th scope="row">{formatClinicDate(b.weekStart)}</th>
                <td>{b.written ? b.episodes : "Nothing written down"}</td>
                <td>{b.written ? (b.confirmed ? "Confirmed" : voice === "patient" ? "Noted by you" : "Patient reported") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-teal-700" />
          {voice === "patient" ? "Noted by you" : "Patient reported"}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-teal-700 bg-teal-700" />
          Confirmed by a physiotherapist
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-slate-500" />
          Nothing written down that week
        </li>
      </ul>
    </div>
  );
}

function ConfirmButton({ entry }: { entry: DiaryEntry }) {
  const router = useRouter();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  async function confirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/therapist/diary/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id }),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), "diary_confirm"));
        return;
      }
      const data = (await res.json().catch(() => null)) as { unchanged?: boolean } | null;
      show(data?.unchanged ? "That one was already confirmed." : "Confirmed. It stays the patient's own account.");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        aria-label={`Confirm: ${diaryEntrySummary(entry, "clinician")}, ${formatClinicDateTime(entry.occurredAt)}`}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? <Spinner /> : <i aria-hidden className="fa-solid fa-check text-xs" />}
        {busy ? "Confirming…" : "Confirm"}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-xs text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export function EntryRow({ entry, voice, canConfirm }: { entry: DiaryEntry; voice: Voice; canConfirm: boolean }) {
  const provenance = diaryProvenance(entry);
  return (
    <li className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{diaryEntrySummary(entry, voice)}</p>
        <p className="text-xs text-slate-700">
          {formatClinicDateTime(entry.occurredAt)} ·{" "}
          <span className={provenance === "patient_reported" ? "font-semibold text-amber-900" : ""}>{diaryProvenanceLabel(provenance, voice)}</span>
          {entry.confirmedAt && ` (${formatClinicDateShort(entry.confirmedAt)})`}
        </p>
        {entry.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-800 [overflow-wrap:anywhere]">{entry.note}</p>}
      </div>
      {canConfirm && provenance === "patient_reported" && <ConfirmButton entry={entry} />}
    </li>
  );
}

/**
 * The patient diary on the Health Profile. The patient's page has the "Log
 * ..." button (the kinds their record keeps, `offeredDiaryKinds`); the
 * assigned therapist's chart has a Confirm control on every entry still
 * waiting for them (`canConfirm`); an admin reads only - neither control is
 * mounted for them, absent rather than disabled. Everything is the patient's
 * own account and says so (diaryProvenanceLabel); a confirmed entry is
 * "confirmed", never rewritten into the clinician's. A diary that could not
 * be read says so apart from an empty one. On the Parkinson's sub-profile the
 * freezing chart and its triggers sit above the list.
 */
export default function DiaryPanel({
  voice,
  profileKind,
  diary,
  bars,
  triggers,
  canLog,
  canConfirm,
  heading,
}: {
  voice: Voice;
  profileKind: ProfileKind;
  /** Falls and near-misses (the neurological and geriatric pages). */
  diary: NeuroDiaryView;
  /** Overrides the card's title ("Falls and near misses"). */
  heading?: { clinician: string; patient: string };
  /** The twelve freezing weeks (Parkinson's only; empty otherwise). */
  bars: FreezingBar[];
  triggers: { trigger: string; label: string; episodes: number }[];
  canLog: boolean;
  canConfirm: boolean;
}) {
  const [logging, setLogging] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const clinician = voice === "clinician";
  const kinds = offeredDiaryKinds(profileKind);
  const parkinsons = profileKind === "neuro_parkinsons";

  const header = (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold text-slate-900">{heading ? heading[clinician ? "clinician" : "patient"] : clinician ? "Patient diary" : "Your diary"}</h2>
        <p className="mt-0.5 text-sm text-slate-700">
          {clinician
            ? "What the patient (or their family) wrote down between sessions. It is their own account until you confirm you have seen it."
            : parkinsons
              ? "Write down when your feet get stuck, a fall or a near miss. Your physiotherapist reads it before your next session."
              : "Write down a fall or a near miss. Your physiotherapist reads it before your next session."}
        </p>
      </div>
      {canLog && kinds.length > 0 && (
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:w-auto print:hidden"
        >
          <i aria-hidden className="fa-solid fa-pen text-xs" />
          {logLabel(kinds)}
        </button>
      )}
    </div>
  );

  if (diary.status === "unreadable") {
    return (
      <section aria-label="Diary" className={CARD} data-testid="diary-panel">
        {header}
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {clinician ? "We couldn't load the diary just now." : "We couldn't load your diary just now."} It is not empty - this is a problem reading it, so please try again in a moment.
        </p>
        {logging && <DiaryLogDialog profileKind={profileKind} onClose={() => setLogging(false)} />}
      </section>
    );
  }

  const awaiting = diary.awaiting;
  // A therapist's waiting entries have their own box with the Confirm control;
  // the list below is everything else, so no entry appears twice.
  const rest = canConfirm ? diary.entries.filter((e) => !awaiting.some((a) => a.id === e.id)) : diary.entries;
  const entries = showAll ? rest : rest.slice(0, RECENT);
  const f = diary.falls;

  return (
    <section aria-label="Diary" className={CARD} data-testid="diary-panel">
      {header}

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-700">Falls, last 3 months</dt>
          <dd className="font-display text-xl font-bold text-slate-900">{f.falls}</dd>
          <dd className="text-xs text-slate-700">
            {f.falls === 0
              ? "None written down"
              : [f.confirmed > 0 ? `${f.confirmed} confirmed` : null, f.patientReported > 0 ? (clinician ? `${f.patientReported} patient reported` : `${f.patientReported} you noted`) : null, f.injured > 0 ? `${plural(f.injured, "hurt", "hurt")}` : null]
                  .filter(Boolean)
                  .join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-700">Near misses</dt>
          <dd className="font-display text-xl font-bold text-slate-900">{f.nearMisses}</dd>
          <dd className="text-xs text-slate-700">{f.nearMisses === 0 ? "None written down" : "in the last 3 months"}</dd>
        </div>
      </dl>

      {parkinsons && (
        <div className="mt-5" data-testid="freezing-card">
          <h3 className="font-display text-base font-bold text-slate-900">{clinician ? "Freezing, by week" : "When your feet got stuck, by week"}</h3>
          <p className="mb-2 mt-0.5 text-xs text-slate-700">
            {clinician
              ? "Episodes a week from the diary. A week with nothing written is blank, not zero."
              : "How many times each week. A blank week means nothing was written down, not that it did not happen."}
          </p>
          <div className={`grid gap-x-8 gap-y-3 ${triggers.length > 0 ? "lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]" : ""}`}>
          <div className="min-w-0 max-w-xl">
            <FreezingChart bars={bars} voice={voice} />
          </div>
          {triggers.length > 0 && (
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900">{clinician ? "What was happening" : "What was happening when it happened"}</h4>
              <ul className="mt-1.5 space-y-1.5">
                {triggers.map((t) => (
                  <li key={t.trigger} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm text-slate-800">
                    <span className="[overflow-wrap:anywhere]">{t.label}</span>
                    <span className="font-semibold">{plural(t.episodes, "time")}</span>
                    <span aria-hidden className="col-span-2 h-1.5 rounded-full bg-slate-200">
                      <span className="block h-1.5 rounded-full bg-teal-600" style={{ width: `${Math.max(6, (t.episodes / triggers[0].episodes) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </div>
        </div>
      )}

      {canConfirm && awaiting.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4" data-testid="diary-awaiting">
          <h3 className="text-sm font-bold text-amber-900">Waiting for you to confirm ({awaiting.length})</h3>
          <p className="text-xs text-slate-700">Confirming says you have seen it and talked it over. It does not change what the patient wrote.</p>
          <ul className="mt-1 divide-y divide-amber-200/70">
            {awaiting.map((e) => (
              <EntryRow key={e.id} entry={e} voice={voice} canConfirm />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <h3 className="font-display text-base font-bold text-slate-900">{clinician ? "Entries" : "What you wrote"}</h3>
        {rest.length === 0 ? (
          <p className="mt-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-700">
            {clinician
              ? awaiting.length > 0 && canConfirm
                ? "Nothing else yet."
                : "Nothing written down yet. Nothing here means nothing was written - not that nothing happened."
              : canLog
                ? "Nothing yet. If something happens between sessions, write it down here."
                : "Nothing written down yet."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} voice={voice} canConfirm={false} />
              ))}
            </ul>
            {rest.length > RECENT && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 inline-flex min-h-[44px] items-center rounded-lg px-1 text-sm font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {showAll ? "Show fewer" : `Show all ${rest.length}`}
              </button>
            )}
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-700">
        {clinician
          ? "A fall the patient reported moves the status only once you have confirmed it here; until then it is shown as patient reported."
          : "What you write is your own account. Once your physiotherapist has seen a fall and confirmed it, it also counts when your progress is read."}
      </p>

      {logging && <DiaryLogDialog profileKind={profileKind} onClose={() => setLogging(false)} />}
    </section>
  );
}
