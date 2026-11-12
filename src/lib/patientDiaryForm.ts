import { CLINIC_TIMEZONE } from "@/lib/bookingSlots";
import { clinicDateKey } from "@/lib/clinicWeek";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import {
  DIARY_ACTIVE_MINUTES_MAX,
  DIARY_FREEZING_COUNT_MAX,
  DIARY_KIND_LABEL as KIND_LABEL,
  diaryKindsFor,
  validateDiaryEntry,
  type DiaryAddRequest,
  type DiaryEntry,
  type DiaryKind,
  type ActivityIntensity,
  type DiaryMedicationState,
  type ActiveMinutesDetails,
  type DiaryPlace,
  type FallDetails,
  type FreezingDetails,
  type FreezingPeriod,
  type FreezingTrigger,
  type NearMissDetails,
} from "@/lib/patientDiary";

// The patient's "write in my diary" form, as data: what the dialog holds
// (`DiaryDraft`) and the one function that turns it into the body
// POST /api/patient/diary/add takes, re-checked with the route's own
// validateDiaryEntry so a value the screen cannot offer never leaves it.
// The date and time are the clinic's (a fixed +05:30, as the medicine-dose
// time is): the diary is dated by the person writing it, in the zone the
// clinic keeps. Dependency-free and tested.

const CLINIC_UTC_OFFSET = "+05:30";

export type DiaryDraft = {
  kind: DiaryKind | "";
  /** `YYYY-MM-DD`, the clinic's calendar day. */
  date: string;
  /** `HH:MM`, the clinic's clock. */
  time: string;
  period: FreezingPeriod | "";
  /** Typed digits: a day's or a week's tally. */
  count: string;
  trigger: FreezingTrigger | "";
  injured: "" | "yes" | "no";
  gotUp: "" | "yes" | "no";
  place: DiaryPlace | "";
  medicationState: DiaryMedicationState | "";
  /** Typed digits: the minutes of activity (heart and lung diary). */
  minutes: string;
  intensity: ActivityIntensity | "";
  note: string;
};

const CLINIC_CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });

/** A blank form dated now, in the clinic's zone. */
export function emptyDiaryDraft(nowMs: number, kind: DiaryKind | "" = ""): DiaryDraft {
  return {
    kind,
    date: clinicDateKey(nowMs),
    time: CLINIC_CLOCK.format(new Date(nowMs)).replace(/^24:/, "00:"),
    period: "",
    count: "",
    trigger: "",
    injured: "",
    gotUp: "",
    place: "",
    medicationState: "",
    minutes: "",
    intensity: "",
    note: "",
  };
}

/** The kinds the form offers, as the server will accept them. */
export function offeredDiaryKinds(profileKind: ProfileKind): DiaryKind[] {
  // Active minutes are the heart and lung programme's dose: diaryKindsFor
  // gives them to that record alone, so a neurological patient is never
  // offered them.
  return [...diaryKindsFor(profileKind)];
}

export type DiaryRequestResult = { ok: true; body: DiaryAddRequest } | { ok: false; error: string };

export function buildDiaryRequest(draft: DiaryDraft, ctx: { profileKind: ProfileKind; nowMs: number }): DiaryRequestResult {
  if (!draft.kind) return { ok: false, error: "Choose what you are writing down." };
  if (!offeredDiaryKinds(ctx.profileKind).includes(draft.kind)) {
    return { ok: false, error: "This kind of diary entry is not part of your care plan. Your physiotherapist can tell you what to note down." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
    return { ok: false, error: "Say when it happened." };
  }
  const at = Date.parse(`${draft.date}T${draft.time}:00${CLINIC_UTC_OFFSET}`);
  if (!Number.isFinite(at)) return { ok: false, error: "Say when it happened." };

  const details: Record<string, unknown> = {};
  if (draft.kind === "freezing") {
    if (!draft.period) return { ok: false, error: "Say whether this is one time, a whole day or a whole week." };
    details.period = draft.period;
    if (draft.period === "episode") details.count = 1;
    else {
      const text = draft.count.trim();
      const count = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(count) || count < 1 || count > DIARY_FREEZING_COUNT_MAX) {
        return { ok: false, error: `Type how many times, as a whole number from 1 to ${DIARY_FREEZING_COUNT_MAX}.` };
      }
      details.count = count;
    }
    if (draft.trigger) details.trigger = draft.trigger;
  } else if (draft.kind === "active_minutes") {
    const text = draft.minutes.trim();
    const minutes = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > DIARY_ACTIVE_MINUTES_MAX) {
      return { ok: false, error: `Type how many minutes, as a whole number from 1 to ${DIARY_ACTIVE_MINUTES_MAX}.` };
    }
    details.minutes = minutes;
    if (draft.intensity) details.intensity = draft.intensity;
  } else if (draft.kind === "fall") {
    if (!draft.injured) return { ok: false, error: "Say whether you were hurt." };
    details.injured = draft.injured === "yes";
    if (draft.gotUp) details.gotUpAlone = draft.gotUp === "yes";
  }
  if (draft.kind !== "freezing" && draft.kind !== "active_minutes" && draft.place) details.place = draft.place;
  if (draft.kind !== "active_minutes" && draft.medicationState) details.medicationState = draft.medicationState;

  const note = draft.note.trim();
  const body: DiaryAddRequest = { kind: draft.kind, occurredAt: new Date(at).toISOString(), details, ...(note ? { note } : {}) };
  const checked = validateDiaryEntry(body, ctx);
  return checked.ok ? { ok: true, body } : { ok: false, error: checked.error };
}

export const PLACE_LABEL: Record<DiaryPlace, string> = {
  indoors_home: "Indoors at home",
  outdoors_home: "Outside at home (garden, steps)",
  out_and_about: "Out and about",
  other: "Somewhere else",
};

export const MEDICATION_STATE_LABEL: Record<DiaryMedicationState, string> = {
  on: "Medicine working well (ON)",
  off: "Medicine wearing off (OFF)",
  not_sure: "Not sure",
};

export const INTENSITY_LABEL: Record<ActivityIntensity, { label: string; hint: string }> = {
  light: { label: "Light", hint: "You could sing" },
  moderate: { label: "Moderate", hint: "You could talk, not sing" },
  vigorous: { label: "Hard", hint: "You could not finish a sentence" },
};

export const PERIOD_LABEL: Record<FreezingPeriod, string> = {
  episode: "Just now - one time",
  day: "A whole day, added up",
  week: "A whole week, added up",
};

// --- Reading an entry back -------------------------------------------------------------------


const TRIGGER_WORDS: Record<FreezingTrigger, string> = {
  starting: "starting to walk",
  turning: "turning round",
  doorway: "a doorway",
  crowded_or_narrow: "a crowded or narrow place",
  other: "something else",
};

const STATE_WORDS: Record<DiaryMedicationState, string> = { on: "medicine working (ON)", off: "medicine wearing off (OFF)", not_sure: "not sure about the medicine" };

/** One entry in a line of plain words, for the diary list: what happened and
 *  the detail that was written down, nothing that was not. */
export function diaryEntrySummary(entry: Pick<DiaryEntry, "kind" | "details">, voice: "patient" | "clinician"): string {
  const label = KIND_LABEL[entry.kind][voice];
  const parts: string[] = [];
  if (entry.kind === "freezing") {
    const d = entry.details as FreezingDetails;
    const count = typeof d.count === "number" ? d.count : 1;
    const unit = d.period === "week" ? " in a week" : d.period === "day" ? " in a day" : "";
    parts.push(voice === "patient" ? `Feet got stuck ${count} ${count === 1 ? "time" : "times"}${unit}` : `${label}: ${count} ${count === 1 ? "episode" : "episodes"}${unit}`);
    if (d.trigger) parts.push(TRIGGER_WORDS[d.trigger] ?? d.trigger);
    if (d.medicationState) parts.push(STATE_WORDS[d.medicationState]);
  } else if (entry.kind === "fall") {
    const d = entry.details as FallDetails;
    parts.push(label);
    parts.push(d.injured ? "hurt" : "not hurt");
    if (d.gotUpAlone === true) parts.push("got up alone");
    if (d.gotUpAlone === false) parts.push("needed help to get up");
    if (d.place) parts.push(PLACE_LABEL[d.place].toLowerCase());
    if (d.medicationState) parts.push(STATE_WORDS[d.medicationState]);
  } else if (entry.kind === "near_miss") {
    const d = entry.details as NearMissDetails;
    parts.push(label);
    if (d.place) parts.push(PLACE_LABEL[d.place].toLowerCase());
    if (d.medicationState) parts.push(STATE_WORDS[d.medicationState]);
  } else {
    const d = entry.details as ActiveMinutesDetails;
    const minutes = typeof d.minutes === "number" ? d.minutes : 0;
    const how = d.intensity === "vigorous" ? "vigorous" : d.intensity === "moderate" ? "moderate" : d.intensity === "light" ? "light" : null;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} of ${how ? `${how} ` : ""}activity`;
  }
  return parts.join(", ");
}
