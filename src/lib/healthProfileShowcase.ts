// The public "Your health profile" showcase on /how-it-works, and its teaser
// band on the home page. It shows the three specialty profiles with SAMPLE
// data -- never a real patient's -- drawn through the same components a
// patient's own dashboard uses, so the showcase cannot drift from the
// product.
//
// The milestone list is read from the paediatric intake itself, so
// rewording it there rewords it here. Which specialties appear follows
// `site_settings.enabled_intake_specialties`: a profile the clinic has
// switched off is not advertised. Dependency-free apart from those
// definitions, so the sample shapes are testable.

import type { ConditionSpecialty } from "@/lib/conditionSpecialty";
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
  /** What the profile watches over the course, one line each. */
  tracks: string[];
};

export const SHOWCASE_PROFILES: ShowcaseProfile[] = [
  {
    specialty: "ortho",
    label: "Orthopaedic",
    icon: "fa-bone",
    forWho: "Joints, muscles and the back - a sore knee, a stiff shoulder, post-surgery rehab.",
    headline: { metric: "Pain", from: "7/10", to: "3/10" },
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

// ---- The sample dashboard --------------------------------------------------
// What the showcase draws inside its dashboard frame, per specialty. Every
// figure here is consistent with the sample charts above (the unit test
// holds the headline ones), and every timeline entry is a kind of event the
// product really records.

export type DashboardStat = { label: string; value: string; note: string; tone: "good" | "neutral" };
export type TimelineEntry = { date: string; icon: string; text: string };

export type SampleDashboard = {
  patient: string;
  condition: string;
  stats: DashboardStat[];
  plan: { title: string; done: number; total: number };
  timeline: TimelineEntry[];
};

const at = (day: string) => `${day}T12:30:00.000Z`;

export const SAMPLE_DASHBOARDS: Record<ConditionSpecialty, SampleDashboard> = {
  ortho: {
    patient: "Riya",
    condition: "Right knee pain, lower back",
    stats: [
      { label: "Pain now", value: "3.0/10", note: "down 4.0 since first exam", tone: "good" },
      { label: "Sessions", value: "4 of 6", note: "in your course", tone: "neutral" },
      { label: "Next session", value: "Mon", note: "same physiotherapist", tone: "neutral" },
    ],
    plan: { title: "Knee strength and back mobility", done: 4, total: 6 },
    timeline: [
      { date: at("2026-02-16"), icon: "fa-notes-medical", text: "Session 4 notes added by your physiotherapist" },
      { date: at("2026-02-16"), icon: "fa-person-rays", text: "Knee re-scored on the Pain Map: 3.5/10" },
      { date: at("2026-02-09"), icon: "fa-dumbbell", text: "Home exercise updated: step-ups added" },
      { date: at("2026-01-19"), icon: "fa-file-medical", text: "Knee MRI report uploaded and read" },
      { date: at("2026-01-05"), icon: "fa-clipboard-check", text: "Health profile completed before session 1" },
    ],
  },
  neuro: {
    patient: "Arun",
    condition: "Recovery after stroke, left side",
    stats: [
      { label: "Independence", value: "7/10", note: "up 4 since first review", tone: "good" },
      { label: "Moving indoors", value: "Stick", note: "was: holding on to someone", tone: "good" },
      { label: "Falls", value: "0", note: "since starting", tone: "good" },
    ],
    plan: { title: "Balance, gait and left-hand function", done: 6, total: 10 },
    timeline: [
      { date: at("2026-02-16"), icon: "fa-notes-medical", text: "Review 4: independence scored 7/10" },
      { date: at("2026-02-09"), icon: "fa-notes-medical", text: "Session note: walked to the gate with a stick" },
      { date: at("2026-02-02"), icon: "fa-dumbbell", text: "Home exercise updated: more sit-to-stands" },
      { date: at("2026-01-19"), icon: "fa-shield-heart", text: "Review 2: no falls since starting" },
      { date: at("2026-01-05"), icon: "fa-clipboard-check", text: "Health profile completed with his daughter" },
    ],
  },
  pediatrics: {
    patient: "Meera",
    condition: "Gross motor delay, age 2",
    stats: [
      { label: "Milestones", value: "7 of 11", note: "up 3 since first review", tone: "good" },
      { label: "Sessions", value: "5 of 8", note: "with the same therapist", tone: "neutral" },
      { label: "Next review", value: "Mon", note: "milestones re-checked", tone: "neutral" },
    ],
    plan: { title: "Standing, walking and balance through play", done: 5, total: 8 },
    timeline: [
      { date: at("2026-02-16"), icon: "fa-star", text: "New milestone: walks steadily" },
      { date: at("2026-02-16"), icon: "fa-notes-medical", text: "Review 4 notes shared with her parents" },
      { date: at("2026-02-02"), icon: "fa-puzzle-piece", text: "Home exercise updated: cruising games added" },
      { date: at("2026-01-19"), icon: "fa-star", text: "New milestone: pulls to stand" },
      { date: at("2026-01-05"), icon: "fa-clipboard-check", text: "Health profile completed by her mother" },
    ],
  },
};
