import {
  measurementSource,
  outcomeMeasure,
  PROFILE_KINDS,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import { CARDIO_DO_NOT_EXERCISE_SYMPTOMS } from "@/lib/cardioSafety";

// The guided video assessment (phase 7a): one ordered protocol per profile
// kind, run LIVE in a video session and led by the physiotherapist. Every
// measurement happens on camera while the therapist watches; nothing here
// relies on the patient measuring alone. Video stays on Google Meet -- the
// app does not embed it. The therapist's second screen (the session
// cockpit) shows one step at a time: a short "say to the patient" script,
// a set-up checklist that must be ticked before Save and next unlocks, the
// right tool, and exactly three actions (Stop test, Skip, Save and next).
// The patient's companion screen is display-only: the step name, one big
// instruction, a position picture and a big clock, nothing to press.
//
// Dependency-free on purpose (the "business maths lives in src/lib" rule):
// the cockpit renders from this table AND the measurement route re-derives
// the step from it to refuse a save whose set-up, helper, red flags or
// pre-exercise check is missing (assessmentRun.ts). A step the screen
// cannot offer is a step the server refuses.
//
// CLINICAL CONTENT: every step choice, script, red-flag question, set-up
// item and the order of the steps is TO BE VERIFIED BY A SENIOR
// PHYSIOTHERAPIST before it is used with a patient. The measures and their
// thresholds come from the registry (outcomeMeasures.ts), which carries the
// same mark; nothing here adds a threshold.

/** Version 2 (phase 7d): every protocol gained the Home exercises step
 *  before the summary. A run started on version 1 is refused as
 *  `protocol_changed` and started again. */
export const SESSION_PROTOCOLS_VERSION = 2;

export const CLINICAL_REVIEW_MARK = "to be verified by a senior physiotherapist" as const;

/** The position pictures the companion screen can draw. A small fixed set:
 *  the companion has no free-form imagery. */
export type PatientPicture = "sitting" | "standing" | "lying" | "chair_stand" | "walking" | "balance" | "talking";

export const PATIENT_PICTURES: readonly PatientPicture[] = [
  "sitting",
  "standing",
  "lying",
  "chair_stand",
  "walking",
  "balance",
  "talking",
];

/** Which tool the cockpit shows for a step. `counter_60s` is the one-minute
 *  sit-to-stand's counter (the handbook's video stand-in for the six-minute
 *  walk); `six_minute_walk` exists for an in-person protocol and no video
 *  protocol uses it (the registry says the walk is in person only). */
export type StepTool =
  | "red_flags"
  | "scale_0_10"
  | "score_sheet"
  | "angle"
  | "timed_trials"
  | "counter_30s"
  | "counter_60s"
  | "balance_holds"
  | "six_minute_walk"
  | "vitals"
  | "milestone_check"
  | "peds_exam"
  | "neuro_exam"
  /** Phase 7d: teach the home exercises -- pick, dose, demo, watch, mark
   *  (exercisePlan.ts; the teach and publish routes). */
  | "teach_exercises"
  | "summary";

/** A layer that owns what a step records, instead of outcome_measurements:
 *  pain on the Pain Map (orthopaedic), the neurological exam, the
 *  paediatric exam. Such a step is saved through that layer's own route and
 *  the run's "saved" event names the record it wrote. */
export type RecordLayer = "pain_map" | "neuro_exam" | "peds_exam";

export type StepMeasure = {
  measureKey: string;
  /** When set, only these registry variants may be saved in this step
   *  (the knee bend saves knee flexion, never a shoulder). */
  variants?: readonly string[];
};

export type SetupItem = {
  id: string;
  /** The therapist's checklist wording. Never shown to the patient. */
  label: string;
  /** Ticking it says another adult is standing beside the patient (a
   *  parent, for a child). A step that needs a helper has one. */
  helper?: boolean;
  /** Not every save needs it ticked. Only a helper item may be optional:
   *  on the Home exercises step another adult is needed only for the
   *  exercises flagged "needs helper", so ticking it is what lets those be
   *  taught (and published), and leaving it unticked still lets the rest. */
  optional?: boolean;
};

/** A red-flag question the therapist asks aloud. "Yes" means the flag is
 *  present; every one is answered before step 2. */
export type RedFlagQuestion = { id: string; question: string };

export type StepClock = { kind: "countdown"; seconds: number } | { kind: "count_up" };

export type ProtocolStep = {
  id: string;
  /** The step's name: the cockpit's heading and the companion's step name,
   *  so it is patient-safe (no clinic words). */
  title: string;
  /** The tab label. */
  short: string;
  /** What the therapist says: at most two short sentences, plain English. */
  script: string;
  /** The companion's one big instruction: one plain line. */
  patientLine: string;
  patientPicture: PatientPicture;
  setup: readonly SetupItem[];
  tool: StepTool;
  /** What a save in this step may record in outcome_measurements. */
  measures: readonly StepMeasure[];
  /** Or the layer that records it instead. */
  layer?: RecordLayer;
  needsHelper: boolean;
  /** Physical effort. On the heart and lung protocol an exertion step needs
   *  a clear pre-exercise check first, enforced at the route. */
  exertion: boolean;
  skippable: boolean;
  /** The red-flag step's questions (tool "red_flags" only). */
  redFlags?: readonly RedFlagQuestion[];
  /** The companion's big clock while the step is running. */
  clock?: StepClock;
  review: typeof CLINICAL_REVIEW_MARK;
};

export type SessionProtocol = {
  key: string;
  version: number;
  profileKind: ProfileKind;
  /** The therapist's name for it. */
  title: string;
  /** The patient's name for it. */
  patientTitle: string;
  /** Stop at once if any of these happen (the therapist's panel). */
  stopAtOnce: readonly string[];
  /** The step whose saved vitals the heart and lung pre-exercise check is
   *  worked out from; only on the cardiopulmonary protocol. */
  preExerciseVitalsStepId?: string;
  steps: readonly ProtocolStep[];
  review: typeof CLINICAL_REVIEW_MARK;
};

/** Why a step was skipped. Optional on a skip; fixed words, no free text. */
export const SKIP_REASONS = {
  patient_declined: "The patient did not want to do it today",
  too_painful: "Too painful today",
  not_safe_today: "Not safe to do today",
  no_helper: "No one could stand beside the patient",
  no_equipment: "The equipment was not to hand",
  no_space: "Not enough space",
  out_of_time: "Ran out of time",
  other: "Another reason",
} as const;
export type SkipReason = keyof typeof SKIP_REASONS;

/** Why a test was stopped (its reading is thrown away). */
export const STOP_REASONS = {
  symptoms: "Symptoms during the test",
  patient_asked: "The patient asked to stop",
  near_fall: "A near-fall",
  technical: "The video or the camera failed",
  redo: "Started again",
  other: "Another reason",
} as const;
export type StopReason = keyof typeof STOP_REASONS;

/** Measures that are physical effort, whatever step records them. On the
 *  heart and lung protocol any of these saved in a run needs the clear
 *  pre-exercise check (the six-minute walk is listed although no video
 *  protocol can record it -- the route refuses it on its own terms too). */
export const EXERTION_MEASURE_KEYS: readonly string[] = [
  "six_minute_walk",
  "one_minute_sit_to_stand",
  "chair_stand_30s",
  "five_sit_to_stand",
  "tug",
  "ten_metre_walk",
  "gait_speed_4m",
];

/** The resting vitals the pre-exercise check needs, and which variant. */
export const PRE_EXERCISE_VITALS: readonly StepMeasure[] = [
  { measureKey: "resting_heart_rate" },
  { measureKey: "blood_pressure", variants: ["rest"] },
  { measureKey: "resting_spo2" },
];

const R = CLINICAL_REVIEW_MARK;

// --- Shared pieces -------------------------------------------------------------

const GENERAL_STOP_AT_ONCE: readonly string[] = [
  "Chest pain",
  "Sudden breathlessness",
  "Dizziness",
  "A near-fall",
  "New sharp pain",
];

const CHEST_AND_BREATH: RedFlagQuestion = {
  id: "chest_pain_or_breathless",
  question: "Any chest pain, or breathlessness at rest, today?",
};
const UNWELL: RedFlagQuestion = { id: "unwell_or_fever", question: "A fever, or feeling generally unwell today?" };
const NEW_FALL: RedFlagQuestion = { id: "fall_since_last", question: "A fall or a new injury since your last session?" };
const DIZZY: RedFlagQuestion = { id: "dizzy_today", question: "Any dizziness or feeling faint today?" };

function safetyStep(input: {
  script: string;
  redFlags: readonly RedFlagQuestion[];
  setup: readonly SetupItem[];
  patientLine?: string;
}): ProtocolStep {
  return {
    id: "safety",
    title: "Safety check",
    short: "Safety",
    script: input.script,
    patientLine: input.patientLine ?? "A few safety questions first.",
    patientPicture: "sitting",
    setup: input.setup,
    tool: "red_flags",
    measures: [],
    needsHelper: false,
    exertion: false,
    skippable: false,
    redFlags: input.redFlags,
    review: R,
  };
}

function summaryStep(): ProtocolStep {
  return {
    id: "summary",
    title: "Summary and next steps",
    short: "Summary",
    script: "Let me go over what we found today. Then we can agree what to work on next.",
    patientLine: "We will go over today together.",
    patientPicture: "talking",
    setup: [{ id: "results_look_right", label: "The results look right" }],
    tool: "summary",
    measures: [],
    needsHelper: false,
    exertion: false,
    skippable: false,
    review: R,
  };
}

/** The Home exercises step (phase 7d), the last before the summary in every
 *  protocol. Exertion, so on the heart and lung protocol the pre-exercise
 *  check stands in front of it like any other exercise; skippable, with a
 *  fixed reason. A child is always taught with the parent beside them, so
 *  the paediatric step needs its helper; elsewhere the helper item is
 *  optional and gates only the exercises that need one. */
function teachStep(input: { helperRequired: boolean }): ProtocolStep {
  return {
    id: "exercises",
    title: "Home exercises",
    short: "Exercises",
    script: "Now I will show you some exercises to do at home. Then I will watch you do each one.",
    patientLine: "We will learn some exercises for home together.",
    patientPicture: "standing",
    setup: [
      { id: "whole_body_in_view", label: "The patient's whole body is in view" },
      { id: "clear_space", label: "The patient is in a clear space" },
      input.helperRequired
        ? { id: "parent_close", label: "A parent is beside the child for every exercise", helper: true }
        : { ...HELPER, label: "Another adult is beside the patient (only for exercises that need one)", optional: true },
    ],
    tool: "teach_exercises",
    measures: [],
    needsHelper: input.helperRequired,
    exertion: true,
    skippable: true,
    review: R,
  };
}

const HELPER: SetupItem = { id: "helper_beside", label: "Another adult is standing beside the patient", helper: true };
const CLEAR_SPACE: SetupItem = { id: "clear_space", label: "The patient is in a clear space" };
const CAN_HEAR: SetupItem = { id: "can_hear", label: "The patient can hear you clearly" };
const MEDICATION_NOTED: SetupItem = { id: "medication_noted", label: "ON or OFF, and the last dose time, noted" };

// --- The protocols -------------------------------------------------------------

const ORTHO_KNEE: SessionProtocol = {
  key: "ortho_knee",
  version: 2,
  profileKind: "ortho",
  title: "Knee pain: video assessment",
  patientTitle: "Your knee check",
  stopAtOnce: [...GENERAL_STOP_AT_ONCE, "New sharp knee pain"],
  review: R,
  steps: [
    safetyStep({
      script: "Any chest pain, fever, or a knee that suddenly swelled? Is there a clear space and a sturdy chair?",
      redFlags: [
        CHEST_AND_BREATH,
        UNWELL,
        { id: "knee_hot_swollen", question: "Has the knee suddenly swollen, or gone red or hot?" },
        { id: "leg_numb_weak", question: "Any new numbness, pins and needles or weakness in the leg?" },
        NEW_FALL,
      ],
      setup: [
        CLEAR_SPACE,
        { id: "sturdy_chair", label: "A sturdy chair without arms is ready" },
        { id: "camera_side_on", label: "The camera is side-on to the knee" },
      ],
    }),
    {
      id: "pain",
      title: "Pain score",
      short: "Pain",
      script: "From 0 to 10, how bad is the pain in your knee right now?",
      patientLine: "How is your knee right now? Say a number from 0 to 10.",
      patientPicture: "sitting",
      setup: [{ id: "before_exercise", label: "Asked before any exercise today" }],
      tool: "scale_0_10",
      measures: [],
      layer: "pain_map",
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "function",
      title: "Everyday tasks",
      short: "Function",
      script: "I will read out some everyday tasks. Tell me how hard each one is today, from 0 for not possible to 4 for easy.",
      patientLine: "Tell us how hard each task is: 0 is unable, 4 is no difficulty.",
      patientPicture: "talking",
      setup: [CAN_HEAR],
      tool: "score_sheet",
      measures: [{ measureKey: "lefs" }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "knee_bend",
      title: "Knee bend",
      short: "Knee bend",
      script: "Lie on your back. Slide your heel towards your bottom as far as you can, and hold.",
      patientLine: "Slide your heel towards your bottom. Hold it there.",
      patientPicture: "lying",
      setup: [
        { id: "lying_on_back", label: "The patient is lying on their back" },
        { id: "leg_in_view", label: "The whole leg is in view from the side" },
        { id: "device_steady", label: "The phone or laptop is steady" },
      ],
      tool: "angle",
      measures: [{ measureKey: "joint_range", variants: ["knee_flexion_active", "knee_flexion_passive"] }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "knee_straightening",
      title: "Knee straightening",
      short: "Straightening",
      script: "Put a rolled towel under your heel and let the knee drop straight. Now tighten your thigh and lift.",
      patientLine: "Let your knee drop straight, then tighten the thigh.",
      patientPicture: "lying",
      setup: [
        { id: "towel_under_heel", label: "A rolled towel is under the heel" },
        { id: "leg_in_view", label: "The leg is in view from the side" },
      ],
      tool: "angle",
      measures: [{ measureKey: "joint_range", variants: ["knee_extension_active", "knee_extension_passive"] }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "chair_stand",
      title: "Sit to stand for 30 seconds",
      short: "Chair stand",
      script: "Cross your arms on your chest. When I say go, stand up and sit down as many times as you can.",
      patientLine: "Arms crossed. Stand up and sit down as many times as you can.",
      patientPicture: "chair_stand",
      setup: [
        { id: "chair_against_wall", label: "The chair is against a wall, feet flat" },
        { id: "arms_crossed", label: "Arms crossed on the chest" },
        HELPER,
      ],
      tool: "counter_30s",
      measures: [{ measureKey: "chair_stand_30s" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "countdown", seconds: 30 },
      review: R,
    },
    {
      id: "walk",
      title: "Walking speed",
      short: "Walking",
      script: "Walk at your normal pace until I say stop.",
      patientLine: "Walk at your normal pace until we say stop.",
      patientPicture: "walking",
      setup: [
        { id: "path_marked", label: "A 14-metre path is marked out" },
        HELPER,
        { id: "usual_shoes_aid", label: "Usual shoes and walking aid" },
      ],
      tool: "timed_trials",
      measures: [{ measureKey: "ten_metre_walk" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    teachStep({ helperRequired: false }),
    summaryStep(),
  ],
};

const ORTHO_GENERAL: SessionProtocol = {
  key: "ortho_general",
  version: 2,
  profileKind: "ortho",
  title: "Joint or back pain: video assessment",
  patientTitle: "Your movement check",
  stopAtOnce: GENERAL_STOP_AT_ONCE,
  review: R,
  steps: [
    safetyStep({
      script: "Any chest pain, fever, or a joint that suddenly swelled? Is there a clear space around you?",
      redFlags: [
        CHEST_AND_BREATH,
        UNWELL,
        { id: "joint_hot_swollen", question: "Has a joint suddenly swollen, or gone red or hot?" },
        { id: "new_numb_weak", question: "Any new numbness, pins and needles or weakness?" },
        NEW_FALL,
      ],
      setup: [CLEAR_SPACE, { id: "camera_side_on", label: "The camera can see the joint from the side" }],
    }),
    {
      id: "pain",
      title: "Pain score",
      short: "Pain",
      script: "From 0 to 10, how bad is the pain right now?",
      patientLine: "How is the pain right now? Say a number from 0 to 10.",
      patientPicture: "sitting",
      setup: [{ id: "before_exercise", label: "Asked before any exercise today" }],
      tool: "scale_0_10",
      measures: [],
      layer: "pain_map",
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "range",
      title: "How far it moves",
      short: "Movement",
      script: "Move the joint as far as it comfortably goes, and hold it there.",
      patientLine: "Move as far as is comfortable. Hold it there.",
      patientPicture: "standing",
      setup: [
        { id: "joint_in_view", label: "The whole joint is in view from the side" },
        { id: "device_steady", label: "The phone or laptop is steady" },
      ],
      tool: "angle",
      measures: [{ measureKey: "joint_range" }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "function",
      title: "Everyday tasks",
      short: "Function",
      script: "I will read out some everyday tasks. Tell me how hard each one is today.",
      patientLine: "Tell us how hard each everyday task is today.",
      patientPicture: "talking",
      setup: [CAN_HEAR],
      tool: "score_sheet",
      measures: [{ measureKey: "lefs" }, { measureKey: "koos12" }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    teachStep({ helperRequired: false }),
    summaryStep(),
  ],
};

const NEURO: SessionProtocol = {
  key: "neuro",
  version: 2,
  profileKind: "neuro",
  title: "Neurological: video assessment",
  patientTitle: "Your walking and balance check",
  stopAtOnce: [...GENERAL_STOP_AT_ONCE, "New weakness, numbness or trouble speaking"],
  review: R,
  steps: [
    safetyStep({
      script: "Any chest pain, a bad new headache, or new weakness since we last met? Is someone at home with you?",
      redFlags: [
        CHEST_AND_BREATH,
        { id: "new_weakness_speech", question: "Any new weakness, numbness, or trouble speaking since your last session?" },
        { id: "headache_dizzy", question: "A bad new headache, or dizziness, today?" },
        NEW_FALL,
        UNWELL,
      ],
      setup: [CLEAR_SPACE, { id: "someone_home", label: "Another adult is at home and can help" }],
    }),
    {
      id: "walking_check",
      title: "Walking and balance",
      short: "Walking",
      script: "Walk at your normal pace along the path. Your helper stays right beside you.",
      patientLine: "Walk at your normal pace. Your helper stays beside you.",
      patientPicture: "walking",
      setup: [
        { id: "path_marked", label: "A 14-metre path is marked out" },
        HELPER,
        { id: "usual_aid", label: "Usual shoes, splints and walking aid" },
      ],
      tool: "neuro_exam",
      measures: [],
      layer: "neuro_exam",
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    {
      id: "walking_ability",
      title: "How you get about",
      short: "Getting about",
      script: "Tell me how much help you need to walk indoors and outside.",
      patientLine: "Tell us how much help you need to walk.",
      patientPicture: "talking",
      setup: [{ id: "watched_walk", label: "You have watched the patient walk today" }],
      tool: "score_sheet",
      measures: [{ measureKey: "fac" }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    teachStep({ helperRequired: false }),
    summaryStep(),
  ],
};

const NEURO_PARKINSONS: SessionProtocol = {
  key: "neuro_parkinsons",
  version: 2,
  profileKind: "neuro_parkinsons",
  title: "Parkinson's: video assessment",
  patientTitle: "Your walking and balance check",
  stopAtOnce: [...GENERAL_STOP_AT_ONCE, "Freezing that does not ease"],
  review: R,
  steps: [
    safetyStep({
      script: "Any chest pain, dizziness when you stand, or a fall since we last met? When did you take your last dose?",
      redFlags: [
        CHEST_AND_BREATH,
        { id: "dizzy_standing", question: "Dizziness or feeling faint when you stand up, today?" },
        NEW_FALL,
        UNWELL,
      ],
      setup: [CLEAR_SPACE, MEDICATION_NOTED, { id: "someone_home", label: "Another adult is at home and can help" }],
    }),
    {
      id: "up_and_go",
      title: "Stand, walk and sit",
      short: "Up and go",
      script: "Stand up, walk to the mark at your normal pace, turn, walk back and sit down.",
      patientLine: "Stand up, walk to the mark, turn, come back and sit.",
      patientPicture: "walking",
      setup: [
        { id: "chair_with_arms", label: "A chair with arms, and a mark 3 metres away" },
        HELPER,
        MEDICATION_NOTED,
      ],
      tool: "timed_trials",
      measures: [{ measureKey: "tug" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    {
      id: "walk",
      title: "Walking speed",
      short: "Walking",
      script: "Walk at your normal pace until I say stop.",
      patientLine: "Walk at your normal pace until we say stop.",
      patientPicture: "walking",
      setup: [{ id: "path_marked", label: "A 14-metre path is marked out" }, HELPER, MEDICATION_NOTED],
      tool: "timed_trials",
      measures: [{ measureKey: "ten_metre_walk" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    {
      id: "five_stands",
      title: "Five stands from a chair",
      short: "Five stands",
      script: "Cross your arms on your chest. Stand up and sit down five times, as fast as you safely can.",
      patientLine: "Arms crossed. Stand up and sit down five times.",
      patientPicture: "chair_stand",
      setup: [
        { id: "chair_against_wall", label: "The chair is against a wall, feet flat" },
        HELPER,
        MEDICATION_NOTED,
      ],
      tool: "timed_trials",
      measures: [{ measureKey: "five_sit_to_stand" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    teachStep({ helperRequired: false }),
    summaryStep(),
  ],
};

const PEDIATRICS: SessionProtocol = {
  key: "pediatrics",
  version: 2,
  profileKind: "pediatrics",
  title: "Paediatric: video assessment",
  patientTitle: "Your child's movement check",
  stopAtOnce: ["Your child is upset or in pain", "A fall or a knock", "Breathing looks hard"],
  review: R,
  steps: [
    safetyStep({
      script: "Is your child well today, with no fever or cough? Any new pain, a fall, or a seizure since last time?",
      patientLine: "A few questions for you first.",
      redFlags: [
        { id: "child_unwell", question: "Is your child unwell, with a fever or a cough, today?" },
        { id: "child_new_pain_fall", question: "Any new pain, swelling or a fall since last time?" },
        { id: "child_seizure", question: "Any seizures since last time?" },
      ],
      setup: [
        { id: "floor_space", label: "Clear floor space, the child in view" },
        { id: "parent_holds_camera", label: "A parent can move the camera to follow the child" },
      ],
    }),
    {
      id: "milestones",
      title: "How your child moves",
      short: "Movement",
      script: "Let's see how your child sits, crawls and stands today. Show me with a favourite toy.",
      patientLine: "Show us how your child sits, crawls and stands.",
      patientPicture: "sitting",
      setup: [
        { id: "parent_with_child", label: "A parent is with the child", helper: true },
        { id: "floor_space", label: "Clear floor space, the child in view" },
      ],
      tool: "milestone_check",
      measures: [],
      layer: "peds_exam",
      needsHelper: true,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "standing_time",
      title: "Standing on their own",
      short: "Standing",
      script: "Stand your child up and let go when they are steady. Stay close enough to catch.",
      patientLine: "Let go when your child is steady. Stay close.",
      patientPicture: "standing",
      setup: [{ id: "parent_close", label: "A parent is close enough to catch", helper: true }],
      tool: "timed_trials",
      measures: [{ measureKey: "peds_standing_seconds" }],
      needsHelper: true,
      exertion: false,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    {
      id: "steps_alone",
      title: "Steps on their own",
      short: "Steps",
      script: "Call your child towards you from a few steps away. I will count the steps.",
      patientLine: "Call your child towards you.",
      patientPicture: "walking",
      setup: [
        { id: "parent_close", label: "A parent is close enough to catch", helper: true },
        { id: "floor_space", label: "Clear floor space, the child in view" },
      ],
      tool: "timed_trials",
      measures: [{ measureKey: "peds_independent_steps" }],
      needsHelper: true,
      exertion: false,
      skippable: true,
      review: R,
    },
    teachStep({ helperRequired: true }),
    summaryStep(),
  ],
};

const GERIATRIC: SessionProtocol = {
  key: "geriatric",
  version: 2,
  profileKind: "geriatric",
  title: "Falls and strength: video assessment",
  patientTitle: "Your strength and balance check",
  stopAtOnce: GENERAL_STOP_AT_ONCE,
  review: R,
  steps: [
    safetyStep({
      script: "Any chest pain, dizziness, or a fall since we last met? Is someone at home who can stand beside you?",
      redFlags: [
        CHEST_AND_BREATH,
        DIZZY,
        NEW_FALL,
        UNWELL,
        { id: "new_pain_walking", question: "Any new pain that makes walking hard?" },
      ],
      setup: [CLEAR_SPACE, { id: "someone_home", label: "Another adult is at home and can help" }],
    }),
    {
      id: "up_and_go",
      title: "Stand, walk and sit",
      short: "Up and go",
      script: "Stand up, walk to the mark at your normal pace, turn, walk back and sit down.",
      patientLine: "Stand up, walk to the mark, turn, come back and sit.",
      patientPicture: "walking",
      setup: [{ id: "chair_with_arms", label: "A chair with arms, and a mark 3 metres away" }, HELPER],
      tool: "timed_trials",
      measures: [{ measureKey: "tug" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    {
      id: "chair_stand",
      title: "Sit to stand for 30 seconds",
      short: "Chair stand",
      script: "Cross your arms on your chest. When I say go, stand up and sit down as many times as you can.",
      patientLine: "Arms crossed. Stand up and sit down as many times as you can.",
      patientPicture: "chair_stand",
      setup: [
        { id: "chair_against_wall", label: "The chair is against a wall, feet flat" },
        { id: "arms_crossed", label: "Arms crossed on the chest" },
        HELPER,
      ],
      tool: "counter_30s",
      measures: [{ measureKey: "chair_stand_30s" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "countdown", seconds: 30 },
      review: R,
    },
    {
      id: "balance",
      title: "Balance positions",
      short: "Balance",
      script: "Stand with your feet in the position I show you. Hold it for as long as you can, up to 10 seconds.",
      patientLine: "Hold this position. Your helper stays beside you.",
      patientPicture: "balance",
      setup: [{ id: "near_counter", label: "Standing next to a counter or a sturdy chair" }, HELPER],
      tool: "balance_holds",
      measures: [{ measureKey: "four_stage_balance" }],
      needsHelper: true,
      exertion: false,
      skippable: true,
      clock: { kind: "countdown", seconds: 10 },
      review: R,
    },
    {
      id: "walking_speed",
      title: "Walking speed",
      short: "Walking",
      script: "Walk at your normal pace until I say stop.",
      patientLine: "Walk at your normal pace until we say stop.",
      patientPicture: "walking",
      setup: [{ id: "path_marked", label: "A 4-metre path is marked out, with room to slow down" }, HELPER],
      tool: "timed_trials",
      measures: [{ measureKey: "gait_speed_4m" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "count_up" },
      review: R,
    },
    {
      id: "daily_living",
      title: "Everyday tasks",
      short: "Daily living",
      script: "I will ask about six everyday tasks. Tell me if you need help with any of them.",
      patientLine: "Tell us which everyday tasks you need help with.",
      patientPicture: "talking",
      setup: [CAN_HEAR],
      tool: "score_sheet",
      measures: [{ measureKey: "katz_adl" }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    teachStep({ helperRequired: false }),
    summaryStep(),
  ],
};

const CARDIOPULMONARY: SessionProtocol = {
  key: "cardiopulmonary",
  version: 2,
  profileKind: "cardiopulmonary",
  title: "Heart and lung: video assessment",
  patientTitle: "Your heart and lung check",
  stopAtOnce: [
    "Chest pain or tightness",
    "Breathlessness that does not settle with rest",
    "Dizziness, staggering, or leg cramps",
    "Heavy sweating, or turning pale or grey",
    "Oxygen dropping below the stop limit",
  ],
  preExerciseVitalsStepId: "resting_check",
  review: R,
  steps: [
    safetyStep({
      script: "Any chest pain, new swelling, or a fever today? Is your oximeter and blood pressure monitor to hand?",
      redFlags: [
        ...CARDIO_DO_NOT_EXERCISE_SYMPTOMS.map((question, i) => ({
          id: ["chest_pain_new", "recent_heart_attack", "swelling_fever_weight"][i] ?? `cardio_symptom_${i}`,
          question: `${question}?`,
        })),
        DIZZY,
        { id: "more_breathless", question: "More breathless than usual at rest today?" },
      ],
      setup: [CLEAR_SPACE, { id: "devices_ready", label: "The patient's own oximeter and blood pressure monitor are ready" }],
    }),
    {
      id: "resting_check",
      title: "Resting check",
      short: "Resting",
      script: "Sit quietly and put your oximeter on. Now hold the screen up to the camera for me.",
      patientLine: "Sit quietly. Hold your monitor up to the camera.",
      patientPicture: "sitting",
      setup: [
        { id: "rested_5_min", label: "The patient has rested sitting for 5 minutes" },
        { id: "device_in_view", label: "The device screen is readable on camera" },
      ],
      tool: "vitals",
      measures: PRE_EXERCISE_VITALS,
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "breathless_now",
      title: "Breathlessness now",
      short: "Breathless",
      script: "From 0 to 10, how breathless do you feel right now, sitting still?",
      patientLine: "How breathless are you now? Say a number from 0 to 10.",
      patientPicture: "sitting",
      setup: [CAN_HEAR],
      tool: "scale_0_10",
      measures: [{ measureKey: "breathlessness_nrs", variants: ["rest"] }],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    {
      id: "sit_to_stand",
      title: "Sit to stand for one minute",
      short: "Sit to stand",
      script: "Cross your arms on your chest. When I say go, stand up and sit down as many times as you can in a minute.",
      patientLine: "Arms crossed. Stand up and sit down at your own pace.",
      patientPicture: "chair_stand",
      setup: [
        { id: "chair_against_wall", label: "A chair of normal height is against a wall" },
        { id: "oximeter_on", label: "The oximeter stays on the finger" },
        HELPER,
      ],
      tool: "counter_60s",
      measures: [{ measureKey: "one_minute_sit_to_stand" }],
      needsHelper: true,
      exertion: true,
      skippable: true,
      clock: { kind: "countdown", seconds: 60 },
      review: R,
    },
    {
      id: "after_check",
      title: "After the test",
      short: "After",
      script: "Sit down and rest. Hold your monitor up to the camera again, and tell me how breathless you feel.",
      patientLine: "Sit and rest. Hold your monitor up to the camera.",
      patientPicture: "sitting",
      setup: [{ id: "device_in_view", label: "The device screen is readable on camera" }],
      tool: "vitals",
      measures: [
        { measureKey: "lowest_spo2" },
        { measureKey: "blood_pressure", variants: ["after_exercise"] },
        { measureKey: "breathlessness_nrs", variants: ["after_test"] },
      ],
      needsHelper: false,
      exertion: false,
      skippable: true,
      review: R,
    },
    teachStep({ helperRequired: false }),
    summaryStep(),
  ],
};

/** Ordered: the first protocol for a profile kind is its default. */
export const SESSION_PROTOCOLS: readonly SessionProtocol[] = [
  ORTHO_KNEE,
  ORTHO_GENERAL,
  NEURO,
  NEURO_PARKINSONS,
  PEDIATRICS,
  GERIATRIC,
  CARDIOPULMONARY,
];

// --- Patient-visible wording -----------------------------------------------------

/** Words the companion never shows: clinic register, category words, and
 *  the record's own vocabulary ("one word for the record", clinical.md). */
export const CLINIC_WORDS: readonly string[] = [
  "triage",
  "specialty",
  "speciality",
  "case",
  "geriatric",
  "elderly",
  "cardiopulmonary",
  "patient",
  "protocol",
  "red flag",
  "score sheet",
  "lefs",
];

export function containsClinicWord(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of CLINIC_WORDS) {
    const re = new RegExp(`(^|[^a-z])${word.replace(/ /g, "\\s+")}([^a-z]|$)`);
    if (re.test(lower)) return word;
  }
  return null;
}

/** Sentences in a line: each `.`, `?` or `!` that ends one. */
export function sentenceCount(text: string): number {
  const ends = text.trim().match(/[.?!]+(\s|$)/g);
  return ends ? ends.length : text.trim() ? 1 : 0;
}

export const SCRIPT_MAX_SENTENCES = 2;
export const SCRIPT_MAX_CHARS = 140;
export const PATIENT_LINE_MAX_CHARS = 70;
export const TITLE_MAX_CHARS = 32;
export const SHORT_MAX_CHARS = 14;

// --- Lookups -------------------------------------------------------------------

const BY_KEY = new Map(SESSION_PROTOCOLS.map((p) => [p.key, p]));

export function sessionProtocol(key: string): SessionProtocol | null {
  return BY_KEY.get(key) ?? null;
}

export function protocolsForProfileKind(kind: ProfileKind): SessionProtocol[] {
  return SESSION_PROTOCOLS.filter((p) => p.profileKind === kind);
}

/** The protocol a run starts on when the therapist does not pick one. */
export function defaultProtocolFor(kind: ProfileKind): SessionProtocol | null {
  return protocolsForProfileKind(kind)[0] ?? null;
}

export function protocolStep(protocol: SessionProtocol, stepId: string): ProtocolStep | null {
  return protocol.steps.find((s) => s.id === stepId) ?? null;
}

export function stepIndex(protocol: SessionProtocol, stepId: string): number {
  return protocol.steps.findIndex((s) => s.id === stepId);
}

/** The red-flag step: always the first. */
export function redFlagStep(protocol: SessionProtocol): ProtocolStep {
  return protocol.steps[0];
}

/** Whether a measure (and variant) may be saved in this step. */
export function stepRecordsMeasure(step: ProtocolStep, measureKey: string, variant: string | null): boolean {
  const entry = step.measures.find((m) => m.measureKey === measureKey);
  if (!entry) return false;
  if (!entry.variants) return true;
  return variant !== null && entry.variants.includes(variant);
}

export function isExertionMeasure(measureKey: string): boolean {
  return EXERTION_MEASURE_KEYS.includes(measureKey);
}

/** Whether the heart and lung pre-exercise check stands in front of this
 *  step (or this measure saved in it). */
export function needsPreExerciseCheck(protocol: SessionProtocol, step: ProtocolStep, measureKey?: string): boolean {
  if (protocol.profileKind !== "cardiopulmonary") return false;
  return step.exertion || (measureKey !== undefined && isExertionMeasure(measureKey));
}

export function helperSetupItems(step: ProtocolStep): SetupItem[] {
  return step.setup.filter((s) => s.helper === true);
}

/** The set-up items a save needs ticked (every item but an optional helper). */
export function requiredSetupItems(step: ProtocolStep): SetupItem[] {
  return step.setup.filter((s) => s.optional !== true);
}

/** The Home exercises step: one per protocol, just before the summary. */
export function teachExercisesStep(protocol: SessionProtocol): ProtocolStep | null {
  return protocol.steps.find((s) => s.tool === "teach_exercises") ?? null;
}

// --- Module-load assertions ---------------------------------------------------------
//
// Thrown at load, the posture outcomeMeasures.ts and conditionIntake.ts take:
// a protocol that names a measure the registry does not hold, a measure the
// route would refuse for this kind of patient, or an in-person-only test in a
// video protocol is a cockpit that offers a Save the server cannot keep.

export function protocolProblems(protocols: readonly SessionProtocol[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const p of protocols) {
    if (keys.has(p.key)) problems.push(`duplicate protocol key "${p.key}"`);
    keys.add(p.key);
    if (!PROFILE_KINDS.includes(p.profileKind)) problems.push(`${p.key}: unknown profile kind`);
    if (p.review !== CLINICAL_REVIEW_MARK) problems.push(`${p.key}: not marked for clinical review`);
    for (const word of [p.patientTitle]) {
      const bad = containsClinicWord(word);
      if (bad) problems.push(`${p.key}: patient title uses the clinic word "${bad}"`);
    }
    if (p.steps.length < 3) problems.push(`${p.key}: too few steps`);
    if (p.steps[0]?.tool !== "red_flags") problems.push(`${p.key}: the first step must be the red-flag check`);
    if (p.steps[p.steps.length - 1]?.tool !== "summary") problems.push(`${p.key}: the last step must be the summary`);
    if (p.steps.filter((s) => s.tool === "teach_exercises").length !== 1) problems.push(`${p.key}: needs exactly one Home exercises step`);

    const stepIds = new Set<string>();
    let restingVitalsSeenAt = -1;
    p.steps.forEach((s, index) => {
      const where = `${p.key}.${s.id}`;
      if (stepIds.has(s.id)) problems.push(`${where}: duplicate step id`);
      stepIds.add(s.id);
      if (s.review !== CLINICAL_REVIEW_MARK) problems.push(`${where}: not marked for clinical review`);
      if (!PATIENT_PICTURES.includes(s.patientPicture)) problems.push(`${where}: unknown picture`);
      if (sentenceCount(s.script) > SCRIPT_MAX_SENTENCES) problems.push(`${where}: script is more than two sentences`);
      if (s.script.length > SCRIPT_MAX_CHARS) problems.push(`${where}: script is too long`);
      if (s.patientLine.length > PATIENT_LINE_MAX_CHARS) problems.push(`${where}: patient line is too long`);
      if (sentenceCount(s.patientLine) > SCRIPT_MAX_SENTENCES) problems.push(`${where}: patient line is more than two sentences`);
      if (s.title.length > TITLE_MAX_CHARS) problems.push(`${where}: title is too long`);
      if (s.short.length > SHORT_MAX_CHARS) problems.push(`${where}: tab label is too long`);
      for (const text of [s.title, s.patientLine]) {
        const bad = containsClinicWord(text);
        if (bad) problems.push(`${where}: patient-visible text uses the clinic word "${bad}"`);
      }
      if (s.setup.length < 1) problems.push(`${where}: no set-up checklist`);
      const setupIds = new Set<string>();
      for (const item of s.setup) {
        if (setupIds.has(item.id)) problems.push(`${where}: duplicate set-up item "${item.id}"`);
        setupIds.add(item.id);
      }
      if (s.tool === "red_flags") {
        if (index !== 0) problems.push(`${where}: the red-flag check must be the first step`);
        if (!s.redFlags || s.redFlags.length === 0) problems.push(`${where}: no red-flag questions`);
        if (s.skippable) problems.push(`${where}: the red-flag check cannot be skipped`);
        const ids = new Set((s.redFlags ?? []).map((q) => q.id));
        if (ids.size !== (s.redFlags ?? []).length) problems.push(`${where}: duplicate red-flag id`);
      } else if (s.redFlags) {
        problems.push(`${where}: only the red-flag step asks red-flag questions`);
      }
      if (s.tool === "summary" && s.skippable) problems.push(`${where}: the summary cannot be skipped`);
      if (s.layer && s.measures.length > 0) problems.push(`${where}: a layer step records nothing in the measurement table`);
      const requiredHelpers = helperSetupItems(s).filter((i) => i.optional !== true);
      if (s.needsHelper && requiredHelpers.length === 0) problems.push(`${where}: needs a helper but has no helper item to tick`);
      if (!s.needsHelper && requiredHelpers.length > 0) problems.push(`${where}: has a helper item but is not marked as needing one`);
      for (const item of s.setup) {
        if (item.optional && !item.helper) problems.push(`${where}: only a helper item may be optional ("${item.id}")`);
        if (item.optional && s.tool !== "teach_exercises") problems.push(`${where}: only the Home exercises step has an optional item`);
      }
      if (requiredSetupItems(s).length < 1) problems.push(`${where}: no required set-up item`);
      if (s.tool === "teach_exercises") {
        if (index !== p.steps.length - 2) problems.push(`${where}: Home exercises must come just before the summary`);
        if (!s.exertion) problems.push(`${where}: Home exercises are exercise and the step must say so`);
        if (!s.skippable) problems.push(`${where}: Home exercises can be skipped`);
        if (s.measures.length > 0 || s.layer) problems.push(`${where}: Home exercises record no measurement`);
      }
      if (s.clock?.kind === "countdown" && (!Number.isInteger(s.clock.seconds) || s.clock.seconds < 1 || s.clock.seconds > 600)) {
        problems.push(`${where}: countdown out of range`);
      }

      for (const sm of s.measures) {
        const m = outcomeMeasure(sm.measureKey);
        if (!m) {
          problems.push(`${where}: unknown measure "${sm.measureKey}"`);
          continue;
        }
        if (!m.profileKinds.includes(p.profileKind)) problems.push(`${where}: ${m.key} is not used on this profile kind`);
        if (measurementSource(m.key, p.profileKind) !== "outcome_measurements") {
          problems.push(`${where}: ${m.key} is recorded in another layer for this profile kind`);
        }
        if (m.videoUse === "no") problems.push(`${where}: ${m.key} is done in person only and cannot be in a video protocol`);
        if (!m.enabledByDefault) problems.push(`${where}: ${m.key} is a licensed scale and cannot be in a protocol`);
        if ((m.videoUse === "with_helper" || m.videoUse === "with_parent") && !s.needsHelper) {
          problems.push(`${where}: ${m.key} over video needs a helper`);
        }
        if (isExertionMeasure(m.key) && !s.exertion) problems.push(`${where}: ${m.key} is exertion and the step must say so`);
        for (const v of sm.variants ?? []) {
          if (!m.variants?.some((x) => x.key === v)) problems.push(`${where}: ${m.key} has no variant "${v}"`);
        }
      }

      if (p.preExerciseVitalsStepId === s.id) {
        restingVitalsSeenAt = index;
        for (const need of PRE_EXERCISE_VITALS) {
          for (const v of need.variants ?? [null]) {
            if (!stepRecordsMeasure(s, need.measureKey, v)) {
              problems.push(`${where}: the pre-exercise step must record ${need.measureKey}${v ? ` (${v})` : ""}`);
            }
          }
        }
      }
      if (p.profileKind === "cardiopulmonary" && s.exertion && (restingVitalsSeenAt < 0 || restingVitalsSeenAt > index)) {
        problems.push(`${where}: an exertion step must come after the resting check`);
      }
    });
    if (p.profileKind === "cardiopulmonary" && !p.preExerciseVitalsStepId) {
      problems.push(`${p.key}: the heart and lung protocol names its pre-exercise vitals step`);
    }
    if (p.preExerciseVitalsStepId && !stepIds.has(p.preExerciseVitalsStepId)) {
      problems.push(`${p.key}: unknown pre-exercise vitals step`);
    }
  }
  for (const kind of PROFILE_KINDS) {
    if (!protocols.some((p) => p.profileKind === kind)) problems.push(`no protocol for profile kind ${kind}`);
  }
  return problems;
}

const LOAD_PROBLEMS = protocolProblems(SESSION_PROTOCOLS);
if (LOAD_PROBLEMS.length > 0) {
  throw new Error(`sessionProtocols: ${LOAD_PROBLEMS.join("; ")}`);
}
