// Programme IDs: PED_PKG001, and the displayed form PED_PKG001-2/6.
//
// Every programme -- a therapist's recommendation from the moment it is
// published, and the purchase it becomes -- carries one ID made of its
// condition's short code, its kind (PKG for video sessions, HV for home
// visits) and a number counted per condition and kind. The database mints
// it (`next_programme_code()` in supabase/schema.sql, under a row lock);
// nothing here mints one. This module only reads, writes and compares them,
// and suggests a condition code for the Catalog form -- with the same
// candidate order the database's `condition_short_code_candidates()` walks,
// so the suggestion an admin sees is the code a new condition would get.
//
// The "-2/6" half is never stored: completed sessions over sessions bought
// changes with every session, so it is derived on read from the rows.
//
// Dependency-free so it is tested without a database or a render.

export type ProgrammeKind = "PKG" | "HV";

/** The prefix a programme with no condition gets (old generic packages, a
 *  clinic-wide home-visit rate). Mirrors programme_prefix_for_category(). */
export const PROGRAMME_FALLBACK_PREFIX = "GEN";

export const CONDITION_CODE_PATTERN = /^[A-Z]{2,4}$/;

/** What the kind means to a person. */
export const PROGRAMME_KIND_LABEL: Record<ProgrammeKind, string> = {
  PKG: "Video sessions",
  HV: "Home visits",
};

function words(title: string): string[] {
  return title
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

/**
 * Every code a condition called `title` could get, best first. Kept in
 * lockstep with condition_short_code_candidates() in schema.sql:
 *   1. the first three letters of the first word
 *   2. the initials of the first four words (two or more words only)
 *   3. the first four letters of the first word
 *   4. the first letter and any two later letters, in order (first 12 letters)
 *   5. the first letter (C when there is none) and AA..ZZ
 */
export function conditionCodeCandidates(title: string): string[] {
  const w = words(title ?? "");
  const out: string[] = [];
  if ((w[0]?.length ?? 0) >= 2) out.push(w[0].slice(0, 3));
  if (w.length >= 2) out.push(w.slice(0, 4).map((x) => x[0]).join(""));
  if ((w[0]?.length ?? 0) >= 4) out.push(w[0].slice(0, 4));
  const l = w.join("").slice(0, 12);
  if (l.length >= 3) {
    for (let i = 1; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) out.push(l[0] + l[i] + l[j]);
    }
  }
  const first = l[0] ?? "C";
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) out.push(first + String.fromCharCode(a) + String.fromCharCode(b));
  }
  return out;
}

/** The first candidate nobody else holds. `taken` compares upper-case. */
export function suggestConditionCode(title: string, taken: Iterable<string>): string | null {
  const used = new Set([...taken].map((t) => t.toUpperCase()));
  for (const c of conditionCodeCandidates(title)) if (!used.has(c)) return c;
  return null;
}

/** What an admin typed, as the database will store it. */
export function normaliseConditionCode(raw: string): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** A sentence when the code cannot be saved, null when it can. */
export function conditionCodeProblem(raw: string, takenByOthers: Iterable<string> = []): string | null {
  const code = normaliseConditionCode(raw);
  if (!code) return null; // blank: the database makes one from the name
  if (!CONDITION_CODE_PATTERN.test(code)) {
    return "Use 2 to 4 letters, A to Z - for example PED.";
  }
  for (const t of takenByOthers) {
    if (t.toUpperCase() === code) return `${code} is already another condition's code.`;
  }
  return null;
}

/** PED, PKG, 7 -> PED_PKG007. Mirrors next_programme_code(). */
export function formatProgrammeCode(prefix: string, kind: ProgrammeKind, n: number): string {
  const num = n < 1000 ? String(n).padStart(3, "0") : String(n);
  return `${prefix}_${kind}${num}`;
}

export type ParsedProgrammeId = {
  code: string;
  prefix: string;
  kind: ProgrammeKind;
  number: number;
  done: number | null;
  total: number | null;
};

const ID_PATTERN = /^([A-Z]{2,4})_(PKG|HV)(\d{3,})(?:-(\d+)\/(\d+))?$/;

/** Reads PED_PKG001 or PED_PKG001-2/6 (any case, stray spaces). */
export function parseProgrammeId(text: string | null | undefined): ParsedProgrammeId | null {
  const t = (text ?? "").replace(/\s+/g, "").toUpperCase();
  const m = ID_PATTERN.exec(t);
  if (!m) return null;
  return {
    code: `${m[1]}_${m[2]}${m[3]}`,
    prefix: m[1],
    kind: m[2] as ProgrammeKind,
    number: Number(m[3]),
    done: m[4] === undefined ? null : Number(m[4]),
    total: m[5] === undefined ? null : Number(m[5]),
  };
}

export function programmeKindOf(code: string | null | undefined): ProgrammeKind | null {
  return parseProgrammeId(code)?.kind ?? null;
}

/** done is clamped into 0..total, so a bad count can never print 7/6. */
export function clampProgress(done: number, total: number): { done: number; total: number } {
  const t = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const d = Math.min(t, Math.max(0, Math.floor(Number.isFinite(done) ? done : 0)));
  return { done: d, total: t };
}

/** PED_PKG001 + 2 of 6 -> "PED_PKG001-2/6". */
export function programmeIdWithProgress(code: string, done: number, total: number): string {
  const p = clampProgress(done, total);
  return `${code}-${p.done}/${p.total}`;
}

export type ProgrammeProgress = {
  done: number;
  total: number;
  pending: number;
  /** 0-100, whole. */
  percent: number;
  /** "2 of 6 done". */
  label: string;
};

export function programmeProgress(done: number, total: number): ProgrammeProgress {
  const p = clampProgress(done, total);
  return {
    done: p.done,
    total: p.total,
    pending: p.total - p.done,
    percent: p.total === 0 ? 0 : Math.round((p.done / p.total) * 100),
    label: `${p.done} of ${p.total} done`,
  };
}

/** What every surface shows for one programme. */
export type ProgrammeTag = {
  /** PED_PKG001, or the old SP/HS code on a database without the new IDs. */
  code: string;
  /** PED_PKG001-2/6. */
  display: string;
  done: number;
  total: number;
  /** The old SP0001 / HS0001 code and any ID a rewrite replaced. */
  otherCodes: string[];
};

export function programmeTag(input: {
  programmeCode: string | null | undefined;
  legacyCode?: string | null;
  previousCodes?: readonly string[] | null;
  done: number;
  total: number;
}): ProgrammeTag | null {
  const code = input.programmeCode?.trim() || input.legacyCode?.trim() || "";
  if (!code) return null;
  const p = clampProgress(input.done, input.total);
  const otherCodes = [input.legacyCode, ...(input.previousCodes ?? [])]
    .map((c) => c?.trim() ?? "")
    .filter((c) => c && c !== code);
  return { code, display: programmeIdWithProgress(code, p.done, p.total), done: p.done, total: p.total, otherCodes };
}

function squash(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/**
 * Whether a typed query names this programme. Pasting the displayed form
 * (PED_PKG001-2/6) finds PED_PKG001 even after its count has moved, since
 * the progress half is read off the query first; a partial ID matches by
 * substring, like every other code search in the back office.
 */
export function programmeQueryMatches(query: string, codes: readonly (string | null | undefined)[]): boolean {
  const q = squash(query);
  if (!q) return false;
  const parsed = parseProgrammeId(q);
  const needle = parsed ? parsed.code : q.replace(/-\d+\/\d+$/, "");
  return codes.some((c) => !!c && squash(c).includes(needle));
}
