"use client";

import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { ONBOARDING_GUIDE_SECTION } from "@/lib/tutorial";

/**
 * "How onboarding works": opens the onboarding guide (triage, each
 * condition type's questions, what happens after) on the dashboard
 * tutorial's stage. Renders nothing outside a therapist dashboard, where
 * there is no tutorial to open -- an admin viewing a patient file, say.
 */
export default function OnboardingGuideButton({
  variant = "link",
  className = "",
}: {
  variant?: "link" | "button";
  className?: string;
}) {
  const tutorial = useTutorial();
  if (!tutorial || tutorial.role !== "therapist") return null;
  const look =
    variant === "button"
      ? "rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-amber-800 hover:bg-amber-50"
      : "text-teal-700 hover:text-teal-800 hover:underline";
  return (
    <button
      type="button"
      onClick={() => tutorial.openTour(ONBOARDING_GUIDE_SECTION)}
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition ${look} ${className}`}
    >
      <i className="fa-solid fa-circle-question text-[10px]" aria-hidden="true" />
      How onboarding works
    </button>
  );
}
