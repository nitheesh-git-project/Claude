import { formatClinicDate } from "@/lib/formatDateTime";
import { freezingBars } from "@/lib/neuroProfile";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import { diaryEntryAmount, diaryKindsFor, diaryProvenance, type DiaryEntry, type DiaryKind } from "@/lib/patientDiary";

// The diary in the patient's PDF export: counts only, never the free text of a
// note or the details of an entry, and every count says whose word it is -
// "patient reported" until a physiotherapist has confirmed it. Printed under
// the same "complete or refused" rule as the rest of the export (the route
// refuses when the diary cannot be read), so a document handed to another
// clinician is never a diary missing its newest weeks. Dependency-free.

export type DiaryExportLine = {
  label: string;
  total: number;
  /** "episodes", "falls", "near misses". */
  unit: string;
  patientReported: number;
  confirmed: number;
};

export type DiaryExport = {
  /** The first and the last day anything was written, or null for an empty diary. */
  firstOn: string | null;
  lastOn: string | null;
  lines: DiaryExportLine[];
  /** Weeks somebody wrote about freezing, newest last (Parkinson's only). */
  freezingWeeks: { weekOf: string; episodes: number; confirmed: boolean; partial: boolean }[];
};

const LINE: Record<DiaryKind, { label: string; unit: string } | null> = {
  freezing: { label: "Freezing of gait", unit: "episodes" },
  fall: { label: "Falls", unit: "falls" },
  near_miss: { label: "Near-misses", unit: "near misses" },
  active_minutes: null,
};

/** Null for a record whose profile kind keeps no diary (nothing to print). */
export function buildDiaryExport(entries: readonly DiaryEntry[], opts: { profileKind: ProfileKind; nowMs: number }): DiaryExport | null {
  const kinds = diaryKindsFor(opts.profileKind).filter((k) => LINE[k] !== null);
  if (kinds.length === 0) return null;
  const lines: DiaryExportLine[] = kinds.map((kind) => {
    const mine = entries.filter((e) => e.kind === kind);
    const meta = LINE[kind]!;
    const confirmed = mine.filter((e) => diaryProvenance(e) !== "patient_reported");
    const amount = (list: readonly DiaryEntry[]) => list.reduce((n, e) => n + diaryEntryAmount(e), 0);
    return {
      label: meta.label,
      unit: meta.unit,
      total: amount(mine),
      confirmed: amount(confirmed),
      patientReported: amount(mine) - amount(confirmed),
    };
  });
  const times = entries.map((e) => Date.parse(e.occurredAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const freezingWeeks = kinds.includes("freezing")
    ? freezingBars(entries, opts.nowMs, 12)
        .filter((w) => w.written)
        .map((w) => ({ weekOf: formatClinicDate(w.weekStart), episodes: w.episodes, confirmed: w.confirmed, partial: w.partial }))
    : [];
  return {
    firstOn: times.length ? formatClinicDate(times[0]) : null,
    lastOn: times.length ? formatClinicDate(times[times.length - 1]) : null,
    lines,
    freezingWeeks,
  };
}
