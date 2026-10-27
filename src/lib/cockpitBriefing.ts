// "Before you start" (B5): what the physiotherapist should have in mind before
// the guided assessment's first question, from what is already on record -
// the last session note's plan and its "Anything to watch", the precautions
// the intake rules in (sternal, a high risk of falling, cannot stand), the
// affected side, and on a Parkinson's run the usual medicine times with the
// reminder to ask ON or OFF. Shown in full on the Start panel and folded to
// one line in the cockpit's header.
//
// Read only, never a gate: the server's gates are the run routes'. A read
// that failed is said as "couldn't check", never left out, so an empty strip
// means "nothing on record", not "we did not look". Dependency-free.

import type { ContraFlag } from "@/lib/exerciseLibrary";
import type { ProfileKind } from "@/lib/outcomeMeasures";

export type BriefingTone = "watch" | "info" | "unchecked";

export type BriefingItem = {
  key: string;
  /** "Anything to watch", "Plan from last session". */
  label: string;
  text: string;
  tone: BriefingTone;
  /** A few words for the cockpit header's one line. */
  short: string;
};

export type Briefing = {
  items: BriefingItem[];
  /** The header's one line: the items' short forms joined. Empty when there is nothing. */
  oneLine: string;
  /** The intake's affected side, when it is one side: the side a test starts on. */
  startSide: "" | "left" | "right";
};

export type LastNoteRead =
  | { status: "ok"; note: { data: Record<string, unknown>; dateLabel: string } | null }
  | { status: "unreadable" };

export type IntakeRead = { status: "ok"; data: Record<string, unknown> } | { status: "no_profile" } | { status: "unreadable" };

const PRECAUTION_TEXT: Record<ContraFlag, { text: string; short: string }> = {
  sternal_precautions: { text: "Sternal precautions after open-heart surgery are on file.", short: "Sternal precautions" },
  high_fall_risk: { text: "The intake records a high risk of falling.", short: "Fall risk" },
  cannot_stand: { text: "The intake says they cannot stand or walk indoors.", short: "Cannot stand" },
};

const SHORT_MAX = 40;

function clip(text: string, max = SHORT_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function cockpitBriefing(input: {
  lastNote: LastNoteRead;
  intake: IntakeRead;
  /** null when the intake could not be read (the flags come from it). */
  contraFlags: readonly ContraFlag[] | null;
  profileKind: ProfileKind | null;
}): Briefing {
  const items: BriefingItem[] = [];

  if (input.lastNote.status === "unreadable") {
    items.push({ key: "last_note", label: "Last session", text: "We couldn't check the last session note.", tone: "unchecked", short: "Last note: couldn't check" });
  } else if (input.lastNote.note) {
    const { data, dateLabel } = input.lastNote.note;
    const watch = str(data.red_flags);
    const plan = str(data.next_plan);
    if (watch) items.push({ key: "watch", label: "Anything to watch", text: watch, tone: "watch", short: `Watch: ${clip(watch)}` });
    if (plan) items.push({ key: "plan", label: `Plan from last session (${dateLabel})`, text: plan, tone: "info", short: `Plan: ${clip(plan)}` });
  }

  if (input.contraFlags === null || input.intake.status === "unreadable") {
    items.push({ key: "precautions", label: "Precautions", text: "We couldn't check the intake for precautions.", tone: "unchecked", short: "Precautions: couldn't check" });
  } else {
    for (const flag of input.contraFlags) {
      const p = PRECAUTION_TEXT[flag];
      items.push({ key: `precaution_${flag}`, label: "Precaution", text: p.text, tone: "watch", short: p.short });
    }
  }

  let startSide: Briefing["startSide"] = "";
  if (input.intake.status === "ok") {
    const side = str(input.intake.data.neuro_affected_side);
    if (side && side !== "Not sure") {
      items.push({ key: "affected_side", label: "Affected side", text: side, tone: "info", short: `Affected: ${side.toLowerCase()}` });
      if (side === "Left side") startSide = "left";
      if (side === "Right side") startSide = "right";
    }
    if (input.profileKind === "neuro_parkinsons") {
      const times = str(input.intake.data.neuro_pd_medication_times);
      items.push({
        key: "on_off",
        label: "ON or OFF",
        text: `${times ? `Usual medicine times: ${times}. ` : ""}Ask whether they are ON or OFF and when they took the last dose, before the first test.`,
        tone: "info",
        short: "Ask ON/OFF and last dose",
      });
    }
  }

  return { items, oneLine: items.map((i) => i.short).join(" · "), startSide };
}
