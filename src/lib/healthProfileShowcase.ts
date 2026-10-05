// The public "Your health profile" showcase on /how-it-works, and its teaser
// band on the home page. It shows the three specialty profiles with SAMPLE
// data -- never a real patient's -- drawn through the same components a
// patient's own dashboard uses, so the showcase cannot drift from the
// product.
//
// The questions are read from the intake definitions themselves
// (intakeOrtho / intakeNeuro / intakePediatrics), so rewording one there
// rewords it here. Which specialties appear follows
// `site_settings.enabled_intake_specialties`: a profile the clinic has
// switched off is not advertised. Dependency-free apart from those
// definitions, so the sample shapes are testable.

import type { ConditionSpecialty } from "@/lib/conditionSpecialty";
import type { IntakeQuestion } from "@/lib/conditionIntake";
import { ORTHO_INTAKE_QUESTIONS } from "@/lib/intakeOrtho";
import { NEURO_INTAKE_QUESTIONS } from "@/lib/intakeNeuro";
import { PEDS_INTAKE_QUESTIONS } from "@/lib/intakePediatrics";
import type { PainAssessmentRow } from "@/lib/painMap";
import type { IntakeTrendPoint } from "@/lib/healthProfileSummary";

export type ShowcaseProfile = {
  specialty: ConditionSpecialty;
  label: string;
  icon: string;
  /** Who it is for, in one line. */
  forWho: string;
  /** The headline change the sample shows, for the home page card. */
  headline: { metric: string; from: string; to: string };
  /** The intake questions shown under "What we ask" (short labels). */
  asks: string[];
  /** What the profile watches over the course, one line each. */
  tracks: string[];
};

function shortLabels(questions: IntakeQuestion[], limit = 6): string[] {
  return questions
    .filter((q) => !q.excludeFromCount)
    .slice(0, limit)
    .map((q) => q.label);
}

export const SHOWCASE_PROFILES: ShowcaseProfile[] = [
  {
    specialty: "ortho",
    label: "Orthopaedic",
    icon: "fa-bone",
    forWho: "Joints, muscles and the back - a sore knee, a stiff shoulder, post-surgery rehab.",
    headline: { metric: "Pain", from: "7/10", to: "3/10" },
    asks: shortLabels(ORTHO_INTAKE_QUESTIONS),
    tracks: [
      "Each painful area on the Pain Map, scored 0-10 at every exam",
      "One line for whether the pain is coming down",
      "What makes it worse and what helps, as it changes",
    ],
  },
  {
    specialty: "neuro",
    label: "Neurological",
    icon: "fa-brain",
    forWho: "Stroke, Parkinson's, MS, nerve injuries - getting function back.",
    headline: { metric: "Independence", from: "3/10", to: "7/10" },
    asks: shortLabels(NEURO_INTAKE_QUESTIONS),
    tracks: [
      "Day-to-day independence, 0-10, at every review",
      "How you move indoors, from bed to walking unaided",
      "Falls in the last three months",
    ],
  },
  {
    specialty: "pediatrics",
    label: "Paediatric",
    icon: "fa-child",
    forWho: "Children's development and movement - told by the parent or caregiver.",
    headline: { metric: "Milestones", from: "4", to: "7" },
    asks: shortLabels(PEDS_INTAKE_QUESTIONS),
    tracks: [
      "Milestones your child does on their own, ticked over time",
      "The hardest part of a normal day, and your goal for them",
      "Braces, splints or walkers in use",
    ],
  },
];

/** Only the profiles the clinic has switched on, in a fixed order. */
export function enabledShowcaseProfiles(enabled: ConditionSpecialty[]): ShowcaseProfile[] {
  return SHOWCASE_PROFILES.filter((p) => enabled.includes(p.specialty));
}

// ---- Sample data -----------------------------------------------------------
// Fixed dates so the server and the browser draw the same chart. Four exams
// a fortnight apart: the shape of a typical first course.

const EXAM_DATES = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16"];

/** A sore right knee easing and a lower back that settles. */
export const SAMPLE_PAIN_ASSESSMENTS: PainAssessmentRow[] = [
  // [knee, back]: their average is the trend line -- 7.0, 6.0, 4.5, 3.0 --
  // which is the 7/10 -> 3/10 the home page's card quotes.
  [75, 65],
  [65, 55],
  [50, 40],
  [35, 25],
].flatMap(([knee, back], i) => [
  {
    region: "knee",
    side: "right",
    pain_percent: knee,
    created_at: `${EXAM_DATES[i]}T05:30:00.000Z`,
    submitted_by_role: "therapist",
  },
  {
    region: "lower_back",
    side: "na",
    pain_percent: back,
    created_at: `${EXAM_DATES[i]}T05:30:00.000Z`,
    submitted_by_role: "therapist",
  },
]);

export const SAMPLE_INDEPENDENCE: IntakeTrendPoint[] = [3, 4, 6, 7].map((value, i) => ({
  date: `${EXAM_DATES[i]}T05:30:00.000Z`,
  value,
}));

export const SAMPLE_MILESTONE_COUNTS: IntakeTrendPoint[] = [4, 5, 5, 7].map((value, i) => ({
  date: `${EXAM_DATES[i]}T05:30:00.000Z`,
  value,
}));

/** The milestone list as the intake asks it, with the sample's ticks. */
export function sampleMilestones(): { label: string; done: boolean; isNew: boolean }[] {
  const options = PEDS_INTAKE_QUESTIONS.find((q) => q.key === "peds_milestones")?.options ?? [];
  // The first four at intake, three more by the latest review.
  return options.map((label, i) => ({ label, done: i < 7, isNew: i >= 4 && i < 7 }));
}

export const SAMPLE_NEURO_MOBILITY = { from: "Walk holding on to someone", to: "Walk with a stick or frame" };
export const SAMPLE_NEURO_FALLS = { from: "2 in three months", to: "None since starting" };

/** The course, from the first form to the record you keep. */
export const PROGRESS_STEPS: { icon: string; title: string; body: string }[] = [
  { icon: "fa-clipboard-list", title: "Health profile", body: "Questions for your specialty, before you meet." },
  { icon: "fa-user-doctor", title: "Assessment", body: "Your physiotherapist examines you and writes a plan." },
  { icon: "fa-notes-medical", title: "Every session", body: "Notes and fresh scores after each one." },
  { icon: "fa-chart-line", title: "Reviews", body: "Today set beside your first visit, side by side." },
  { icon: "fa-file-pdf", title: "Your record", body: "The whole chart, as a PDF you keep." },
];
