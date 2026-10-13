"use client";

import { usePathname } from "next/navigation";
import { chapterForSection, tutorialSectionForPath } from "@/lib/tutorial";
import { useTutorial } from "./TutorialProvider";

/**
 * The (i) that replays one chapter of the dashboard tutorial.
 *
 * Without `section` it explains the page it is on (the page title's (i)),
 * read from the URL so no page has to pass anything. With one -- a card key
 * such as "card:health-profile" -- it explains that card. Renders nothing
 * outside a tutorial dashboard, or when nothing covers the section, so it
 * is safe to place anywhere.
 */
export default function TutorialInfoButton({
  section,
  step,
  label,
  size = "md",
  className = "",
}: {
  section?: string;
  /** A step of that chapter to open on. */
  step?: string;
  /** What the button explains, for its accessible name. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const tutorial = useTutorial();
  const pathname = usePathname();
  if (!tutorial) return null;
  const key = section ?? tutorialSectionForPath(pathname ?? "");
  if (key === null) return null;
  const chapter = chapterForSection(tutorial.role, key);
  if (!chapter) return null;
  const dims = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";
  return (
    <button
      type="button"
      onClick={() => tutorial.openTour(key, step)}
      aria-label={`How ${label ?? chapter.title} works`}
      title={`How ${label ?? chapter.title} works`}
      data-testid="tutorial-info"
      className={`group inline-flex shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200 transition hover:scale-110 hover:bg-teal-600 hover:text-white hover:ring-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${dims} ${className}`}
    >
      <i className="fa-solid fa-info" aria-hidden="true" />
    </button>
  );
}
