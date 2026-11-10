// The words on the patient's Home exercises card (phase 7d-2), in the
// patient's voice or, for a child's record, the parent's. Plain, calm, and
// never "care plan" (that is the programme recommendation). Pure, so the
// wording is tested, not hoped for.

export type HomeExercisesVoice = "patient" | "parent";

export function homeExercisesCopy(voice: HomeExercisesVoice) {
  const parent = voice === "parent";
  return {
    heading: parent ? "Home exercises for your child" : "Your home exercises",
    intro: parent
      ? "Do these together at home. Tap an exercise to see how it is done."
      : "Do these at home. Tap an exercise to see how it is done.",
    empty: parent
      ? "Your physiotherapist will teach you and your child the exercises in your video session."
      : "Your physiotherapist will teach you your exercises in your video session.",
    notMigrated: "Home exercises are not available yet.",
    unreadable: "We couldn't load your home exercises just now. Please try again in a moment.",
    steps: "How to do it",
    safety: "Take care",
    note: "From your physiotherapist",
    set: (dateText: string) => `Set by your physiotherapist on ${dateText}.`,
  };
}
