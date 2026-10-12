// How a programme the patient owns is named and pictured.
//
// A recommended programme is bought against a hidden "course" package row
// (care_plan_course) whose title is an internal label ("Paediatrics -
// recommended course") and which has no photo. Showing that row as-is put
// the internal label and a placeholder block on Your Programmes, right after
// the patient had paid for a card that carried the condition's photograph.
// The condition is what both ends share, so a course takes its name and its
// picture from there. A catalog package keeps its own, falling back to the
// condition's photo when it has none.
//
// Dependency-free so it can be tested without rendering.

export type ProgrammeCoverImage = { src: string | null; focalX: number | null; focalY: number | null };

export type ProgrammeDisplay = { title: string; cover: ProgrammeCoverImage | null };

export function programmeDisplay(input: {
  kind: "session" | "home_visit";
  packageTitle: string | null | undefined;
  packageImageUrl: string | null | undefined;
  isCourse: boolean;
  condition: { title: string; src: string | null; focalX: number | null; focalY: number | null } | null | undefined;
}): ProgrammeDisplay {
  const { kind, packageTitle, packageImageUrl, isCourse, condition } = input;
  const conditionCover = condition?.src
    ? { src: condition.src, focalX: condition.focalX, focalY: condition.focalY }
    : null;

  const fallbackTitle = kind === "home_visit" ? "Home visits" : "Your programme";
  const title =
    isCourse && condition
      ? kind === "home_visit"
        ? `${condition.title} - home visits`
        : `${condition.title} programme`
      : packageTitle || condition?.title || fallbackTitle;

  const cover =
    !isCourse && packageImageUrl
      ? { src: packageImageUrl, focalX: null, focalY: null }
      : conditionCover ?? (packageImageUrl ? { src: packageImageUrl, focalX: null, focalY: null } : null);

  return { title, cover };
}
