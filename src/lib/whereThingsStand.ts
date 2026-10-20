import type { WrittenSummary } from "@/lib/careStatus";

// What the "Where things stand" card shows (Health Profile redesign, phase
// 4a). The physiotherapist's WRITTEN summary (care_status_events kind
// "summary") is the card's text whenever there is one. The sentences
// generated from the numbers (orthoProfile.ts standSummary) are two other
// things and only those: a DRAFT the writing box offers to start from, and
// -- when nobody has written anything -- a fallback the card labels as
// generated, so nobody reads the arithmetic as the physiotherapist's view.
// Dependency-free; the three pages shape it the same way.

export type WhereThingsStandView =
  | {
      source: "written";
      text: string;
      setAt: string;
      /** "therapist", or "admin" for the clinic writing on their behalf. */
      setByRole: "therapist" | "admin";
      /** A review is newer: the clinician is asked to look again. */
      stale: boolean;
      /** What the writing box offers when the physiotherapist starts again. */
      draft: string | null;
    }
  | { source: "generated"; text: string; draft: string }
  | { source: "none"; draft: null };

/**
 * `generated` is the generated wording for the person reading the page;
 * `draft` is the same wording in the patient's voice (they are who a
 * written summary is for), or null when the numbers say nothing yet.
 */
export function whereThingsStandView(input: {
  written: WrittenSummary | null;
  generated: string | null;
  draft: string | null;
}): WhereThingsStandView {
  const draft = input.draft?.trim() ? input.draft.trim() : null;
  if (input.written && input.written.text.trim()) {
    return {
      source: "written",
      text: input.written.text,
      setAt: input.written.setAt,
      setByRole: input.written.setByRole,
      stale: input.written.stale,
      draft,
    };
  }
  const generated = input.generated?.trim() ? input.generated.trim() : null;
  if (generated) return { source: "generated", text: generated, draft: draft ?? generated };
  return { source: "none", draft: null };
}

/** The line under the text: who wrote it (or that nobody did), by reader. */
export function whereThingsStandByline(view: WhereThingsStandView, voice: "patient" | "clinician"): string | null {
  if (view.source === "written") {
    const who =
      view.setByRole === "admin"
        ? "Written by the clinic"
        : voice === "patient"
          ? "Written by your physiotherapist"
          : "Written by the physiotherapist";
    return who;
  }
  if (view.source === "generated") {
    return voice === "patient"
      ? "Worked out automatically from your latest numbers - your physiotherapist has not written a summary yet."
      : "Generated automatically from the numbers - nobody has written a summary yet. Write one under Phase and status.";
  }
  return null;
}
