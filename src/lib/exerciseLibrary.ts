import { PROFILE_KINDS, type ProfileKind } from "@/lib/outcomeMeasures";
import { MILESTONE_TEMPLATES } from "@/lib/milestoneTemplates";
import { CLINICAL_REVIEW_MARK, containsClinicWord, sentenceCount } from "@/lib/sessionProtocols";

// The clinic's exercise library for HOME EXERCISES (Health Profile redesign,
// phase 7d). In a guided video session the physiotherapist picks exercises
// from this list, sets the dose, shows the patient a demo on the companion
// screen (the picture and the short steps below -- nothing else), WATCHES
// the patient do each one on camera and marks it. The patient then reads
// the plan on their dashboard. Nothing here asks the patient to report
// anything back.
//
// Vocabulary: this is "Home exercises" (exercise_plans in schema.sql). It is
// NOT the "Care plan" (care_plans / care_plan_versions), which is a
// programme-purchase recommendation. Keep the two words apart on every
// screen (docs/rules/clinical.md).
//
// Code-only for now. The type carries `source` so a clinic-added exercise
// (a DB-backed row an admin writes) can join the same lookups later without
// changing a caller; nothing reads anything but this file today.
//
// Every line a patient reads (the name, the steps, the safety note) is
// patient-safe -- no clinic words -- and checked at load. The dose is a
// starting point the physiotherapist changes; the bounds are in
// exercisePlan.ts.
//
// CLINICAL CONTENT: every exercise, step, dose, safety note, contraindication
// and helper flag is TO BE VERIFIED BY A SENIOR PHYSIOTHERAPIST before it is
// used with a patient. The geriatric set follows the Otago programme's
// basics; none of it is a substitute for that programme's own manual.

export type BodyArea = "knee" | "hip" | "back" | "shoulder" | "ankle" | "legs" | "balance" | "walking" | "breathing" | "arms" | "whole_body";

export const BODY_AREAS: Record<BodyArea, string> = {
  knee: "Knee",
  hip: "Hip",
  back: "Back",
  shoulder: "Shoulder",
  ankle: "Ankle and foot",
  legs: "Legs",
  balance: "Balance",
  walking: "Walking",
  breathing: "Breathing",
  arms: "Arms",
  whole_body: "Whole body",
};

/** The demo pictures the companion screen and the patient's plan can draw
 *  (simple SVGs, drawn in phase 7d-2). A fixed set: no free-form imagery. */
export const EXERCISE_PICTURES = [
  "thigh_tighten",
  "leg_lift_lying",
  "heel_slide",
  "sit_to_stand",
  "sit_to_stand_hands",
  "bridge",
  "knee_to_chest",
  "back_flatten",
  "arm_pendulum",
  "shoulder_squeeze",
  "wall_slide",
  "heel_raise",
  "toe_raise",
  "knee_straighten_seated",
  "walking",
  "seated_reach",
  "weight_shift",
  "arm_raise",
  "ankle_pumps",
  "seated_march",
  "side_steps",
  "big_steps",
  "wide_turn",
  "seated_turn",
  "heel_to_toe_stand",
  "heel_to_toe_walk",
  "one_leg_stand",
  "breathing",
  "shoulder_rolls",
  "crawl",
  "kick_ball",
  "tummy_time",
  "cushion_stand",
  "frog_jump",
  "squat_pick_up",
  "step_over",
] as const;
export type ExercisePicture = (typeof EXERCISE_PICTURES)[number];

/** How an exercise is dosed: sets of repetitions, sets of repetitions each
 *  held, sets of one hold, or minutes. */
export type DoseKind = "reps" | "reps_hold" | "hold" | "minutes";

/** A home-exercise dose. Stored as this exact jsonb (exercise_plan_items.dose);
 *  bounds and the shape for each kind are in exercisePlan.ts. */
export type ExerciseDose = {
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  minutes: number | null;
  timesPerDay: number;
  daysPerWeek: number;
  /** The physiotherapist's optional line in plain words (scanned). */
  note: string | null;
};

/**
 * What in the intake rules an exercise out. Worked out from the answers on
 * file (exercisePlan.ts contraFlagsFromIntake); "where available" -- an
 * answer that was never given raises nothing.
 *   sternal_precautions -- after open-heart surgery: no pushing up with the arms, no arms over the head
 *   high_fall_risk      -- two or more falls, or a fall with an injury, or feet that get stuck most days
 *   cannot_stand        -- uses a wheelchair indoors, mostly in bed, or cannot stand
 */
export type ContraFlag = "sternal_precautions" | "high_fall_risk" | "cannot_stand";
export const CONTRA_FLAGS: readonly ContraFlag[] = ["sternal_precautions", "high_fall_risk", "cannot_stand"];

/** The therapist's wording for why an exercise is ruled out. */
export const CONTRA_FLAG_TEXT: Record<ContraFlag, string> = {
  sternal_precautions: "the surgeon's precautions after open-heart surgery are on file",
  high_fall_risk: "the intake records a high risk of falling",
  cannot_stand: "the intake says they cannot stand or walk indoors",
};

export type ExerciseSource = "code" | "clinic";

export type Exercise = {
  key: string;
  /** Plain name, patient-safe. */
  name: string;
  bodyArea: BodyArea;
  profileKinds: readonly ProfileKind[];
  picture: ExercisePicture;
  /** 3-5 short lines the patient reads, one sentence each. */
  steps: readonly string[];
  doseKind: DoseKind;
  defaultDose: ExerciseDose;
  /** One or two short sentences the patient reads. */
  safety: string;
  contraindications: readonly ContraFlag[];
  /** Another adult (a parent, for a child) stands beside the patient. */
  needsHelper: boolean;
  /** The easier and harder versions, by key. */
  easier?: string;
  harder?: string;
  /** Milestone templates this exercise works towards (milestoneTemplates.ts). */
  milestoneTemplateKeys?: readonly string[];
  source: ExerciseSource;
  review: typeof CLINICAL_REVIEW_MARK;
};

export const EXERCISE_NAME_MAX_CHARS = 32;
export const EXERCISE_STEP_MAX_CHARS = 70;
export const EXERCISE_SAFETY_MAX_CHARS = 110;
export const EXERCISE_STEPS_MIN = 3;
export const EXERCISE_STEPS_MAX = 5;
/** Every profile kind offers at least this many. */
export const EXERCISES_PER_KIND_MIN = 8;

const R = CLINICAL_REVIEW_MARK;

const reps = (sets: number, n: number, timesPerDay = 1, daysPerWeek = 5): ExerciseDose => ({
  sets,
  reps: n,
  holdSeconds: null,
  minutes: null,
  timesPerDay,
  daysPerWeek,
  note: null,
});
const repsHold = (sets: number, n: number, hold: number, timesPerDay = 2, daysPerWeek = 7): ExerciseDose => ({
  sets,
  reps: n,
  holdSeconds: hold,
  minutes: null,
  timesPerDay,
  daysPerWeek,
  note: null,
});
const hold = (sets: number, seconds: number, timesPerDay = 1, daysPerWeek = 5): ExerciseDose => ({
  sets,
  reps: null,
  holdSeconds: seconds,
  minutes: null,
  timesPerDay,
  daysPerWeek,
  note: null,
});
const minutes = (n: number, timesPerDay = 1, daysPerWeek = 5): ExerciseDose => ({
  sets: 1,
  reps: null,
  holdSeconds: null,
  minutes: n,
  timesPerDay,
  daysPerWeek,
  note: null,
});

type Draft = Omit<Exercise, "source" | "review">;

const STOP_IF_PAIN = "Stop if the pain gets sharp or much worse.";
const HOLD_ON = "Keep a hand on a kitchen counter or a sturdy chair.";

const DRAFTS: readonly Draft[] = [
  // ---- Knee, hip and back (orthopaedic) ---------------------------------------------
  {
    key: "thigh_tighten",
    name: "Thigh tighten",
    bodyArea: "knee",
    profileKinds: ["ortho"],
    picture: "thigh_tighten",
    steps: [
      "Sit or lie with your leg out straight.",
      "Put a rolled towel under your knee.",
      "Push the back of your knee down into the towel.",
      "Hold, then relax slowly.",
    ],
    doseKind: "reps_hold",
    defaultDose: repsHold(1, 10, 5, 3),
    safety: STOP_IF_PAIN,
    contraindications: [],
    needsHelper: false,
    harder: "straight_leg_lift",
    milestoneTemplateKeys: ["ortho_knee_straightens_fully"],
  },
  {
    key: "straight_leg_lift",
    name: "Straight leg lift",
    bodyArea: "knee",
    profileKinds: ["ortho"],
    picture: "leg_lift_lying",
    steps: [
      "Lie on your back with your other knee bent.",
      "Tighten your thigh so the knee is straight.",
      "Lift the leg to the height of the other knee.",
      "Lower it slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Keep the knee straight all the way up. Stop if your back hurts.",
    contraindications: [],
    needsHelper: false,
    easier: "thigh_tighten",
  },
  {
    key: "heel_slide",
    name: "Heel slide",
    bodyArea: "knee",
    profileKinds: ["ortho"],
    picture: "heel_slide",
    steps: [
      "Lie on your back with your legs straight.",
      "Slide your heel towards your bottom.",
      "Go as far as is comfortable and hold for a moment.",
      "Slide it back down.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 2, 7),
    safety: "A stretch is fine. Stop if the pain gets sharp.",
    contraindications: [],
    needsHelper: false,
    milestoneTemplateKeys: ["ortho_knee_bends_125"],
  },
  {
    key: "knee_straighten_seated",
    name: "Seated knee straighten",
    bodyArea: "knee",
    profileKinds: ["ortho", "geriatric"],
    picture: "knee_straighten_seated",
    steps: [
      "Sit tall on a firm chair.",
      "Straighten one knee until the leg is level.",
      "Hold for a moment, then lower it slowly.",
      "Do the same with the other leg.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 3),
    safety: "Move slowly. Stop if your knee hurts more than a little.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "bridge",
    name: "Bottom lift",
    bodyArea: "hip",
    profileKinds: ["ortho", "neuro"],
    picture: "bridge",
    steps: [
      "Lie on your back with both knees bent.",
      "Squeeze your bottom.",
      "Lift your hips until your body is in a straight line.",
      "Lower slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Keep breathing. Stop if your back hurts.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "back_flatten",
    name: "Back flatten",
    bodyArea: "back",
    profileKinds: ["ortho"],
    picture: "back_flatten",
    steps: [
      "Lie on your back with both knees bent.",
      "Tighten your tummy gently.",
      "Press the small of your back into the floor.",
      "Hold, then relax.",
    ],
    doseKind: "reps_hold",
    defaultDose: repsHold(1, 10, 5, 2, 7),
    safety: "This should be gentle. Stop if it hurts.",
    contraindications: [],
    needsHelper: false,
    harder: "bridge",
  },
  {
    key: "knee_to_chest",
    name: "Knee to chest",
    bodyArea: "back",
    profileKinds: ["ortho"],
    picture: "knee_to_chest",
    steps: [
      "Lie on your back with both knees bent.",
      "Hold one knee with both hands.",
      "Pull it gently towards your chest and hold.",
      "Lower it and do the other side.",
    ],
    doseKind: "reps_hold",
    defaultDose: repsHold(1, 5, 20, 2, 7),
    safety: "A gentle stretch only. Stop if pain goes down your leg.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "arm_pendulum",
    name: "Arm swing",
    bodyArea: "shoulder",
    profileKinds: ["ortho"],
    picture: "arm_pendulum",
    steps: [
      "Lean forward with your good hand on a table.",
      "Let your sore arm hang down loosely.",
      "Rock your body so the arm swings in small circles.",
      "Change direction after a few circles.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 2, 7),
    safety: "Let the arm hang loose. Do not force the swing.",
    contraindications: [],
    needsHelper: false,
    harder: "wall_slide",
  },
  {
    key: "wall_slide",
    name: "Wall arm slide",
    bodyArea: "shoulder",
    profileKinds: ["ortho"],
    picture: "wall_slide",
    steps: [
      "Stand facing a wall.",
      "Put your hands on the wall at chest height.",
      "Slide your hands up as far as is comfortable.",
      "Slide them back down slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Stop at the point it pinches. Do not push through pain.",
    contraindications: ["sternal_precautions"],
    needsHelper: false,
    easier: "arm_pendulum",
  },
  {
    key: "shoulder_squeeze",
    name: "Shoulder blade squeeze",
    bodyArea: "shoulder",
    profileKinds: ["ortho", "cardiopulmonary"],
    picture: "shoulder_squeeze",
    steps: [
      "Sit or stand tall.",
      "Let your arms rest by your sides.",
      "Squeeze your shoulder blades together and hold.",
      "Relax slowly.",
    ],
    doseKind: "reps_hold",
    defaultDose: repsHold(1, 10, 5, 2, 7),
    safety: "Keep your shoulders down, away from your ears.",
    contraindications: [],
    needsHelper: false,
  },

  // ---- Shared: legs, walking, everyday strength ---------------------------------------
  {
    key: "sit_to_stand",
    name: "Sit to stand",
    bodyArea: "legs",
    profileKinds: ["ortho", "neuro", "neuro_parkinsons", "geriatric", "cardiopulmonary"],
    picture: "sit_to_stand",
    steps: [
      "Sit near the front of a firm chair.",
      "Put your feet flat and cross your arms.",
      "Lean forward and stand up tall.",
      "Sit back down slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Use a chair that will not slide. Stop if you feel dizzy.",
    contraindications: ["cannot_stand"],
    needsHelper: false,
    easier: "sit_to_stand_hands",
    milestoneTemplateKeys: ["neuro_stand_without_hands", "geri_stand_without_arms"],
  },
  {
    key: "sit_to_stand_hands",
    name: "Sit to stand with hands",
    bodyArea: "legs",
    profileKinds: ["neuro", "neuro_parkinsons", "geriatric"],
    picture: "sit_to_stand_hands",
    steps: [
      "Sit near the front of a firm chair with arms.",
      "Put your feet flat and your hands on the chair arms.",
      "Lean forward and push up to stand.",
      "Sit back down slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 8, 1, 5),
    safety: "Use a chair that will not slide. Stop if you feel dizzy.",
    contraindications: ["cannot_stand", "sternal_precautions"],
    needsHelper: false,
    harder: "sit_to_stand",
  },
  {
    key: "heel_raise",
    name: "Heel raise",
    bodyArea: "ankle",
    profileKinds: ["ortho", "neuro_parkinsons", "geriatric", "cardiopulmonary"],
    picture: "heel_raise",
    steps: [
      HOLD_ON,
      "Stand tall with your feet hip-width apart.",
      "Rise up onto your toes.",
      "Lower your heels slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 3),
    safety: "Hold on all the time. Stop if you feel unsteady.",
    contraindications: ["cannot_stand"],
    needsHelper: false,
  },
  {
    key: "toe_raise",
    name: "Toe raise",
    bodyArea: "ankle",
    profileKinds: ["geriatric"],
    picture: "toe_raise",
    steps: [HOLD_ON, "Stand tall with your feet hip-width apart.", "Lift your toes off the floor.", "Lower them slowly."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 3),
    safety: "Hold on all the time. Do not lean back.",
    contraindications: ["cannot_stand"],
    needsHelper: false,
  },
  {
    key: "ankle_pumps",
    name: "Ankle pumps",
    bodyArea: "ankle",
    profileKinds: ["ortho", "neuro", "cardiopulmonary"],
    picture: "ankle_pumps",
    steps: ["Sit or lie with your legs out.", "Point your toes away from you.", "Pull your toes back towards you.", "Keep going at a steady pace."],
    doseKind: "reps",
    defaultDose: reps(2, 20, 3, 7),
    safety: "This should not hurt. Stop if your calf is painful or swollen.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "seated_march",
    name: "Seated marching",
    bodyArea: "legs",
    profileKinds: ["neuro", "neuro_parkinsons", "geriatric", "cardiopulmonary"],
    picture: "seated_march",
    steps: ["Sit tall on a firm chair.", "Lift one knee up, then put it down.", "Lift the other knee.", "Keep a steady rhythm."],
    doseKind: "reps",
    defaultDose: reps(2, 20, 1, 5),
    safety: "Keep breathing steadily. Stop if you get very short of breath.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "walking",
    name: "Daily walk",
    bodyArea: "walking",
    profileKinds: ["ortho", "neuro", "neuro_parkinsons", "geriatric", "cardiopulmonary"],
    picture: "walking",
    steps: [
      "Wear your usual shoes and use your usual walking aid.",
      "Walk at a pace where you can still talk.",
      "Rest whenever you need to.",
    ],
    doseKind: "minutes",
    defaultDose: minutes(10, 1, 5),
    safety: "Stop and rest if you get chest pain, dizziness or very short of breath.",
    contraindications: ["cannot_stand"],
    needsHelper: false,
    milestoneTemplateKeys: ["cardio_walk_10_minutes", "pd_walk_30_minutes", "geri_walk_to_gate", "neuro_walk_to_gate"],
  },

  // ---- Neurological -------------------------------------------------------------------
  {
    key: "seated_reach",
    name: "Seated reach",
    bodyArea: "balance",
    profileKinds: ["neuro", "neuro_parkinsons", "geriatric"],
    picture: "seated_reach",
    steps: [
      "Sit tall on a firm chair with your feet flat.",
      "Reach forward as far as is comfortable.",
      "Come back to sitting tall.",
      "Reach to each side in turn.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Keep your bottom on the chair. Only reach as far as feels safe.",
    contraindications: [],
    needsHelper: false,
    milestoneTemplateKeys: ["neuro_sit_unsupported"],
  },
  {
    key: "weight_shift",
    name: "Side to side sway",
    bodyArea: "balance",
    profileKinds: ["neuro", "geriatric"],
    picture: "weight_shift",
    steps: [
      HOLD_ON,
      "Stand with your feet hip-width apart.",
      "Move your weight slowly onto one leg.",
      "Move it slowly onto the other leg.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Someone should stand beside you. Stop if you feel unsteady.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
  },
  {
    key: "arm_raise_two_hands",
    name: "Two-hand arm lift",
    bodyArea: "arms",
    profileKinds: ["neuro"],
    picture: "arm_raise",
    steps: [
      "Sit tall or lie on your back.",
      "Hold your weaker hand with your other hand.",
      "Lift both arms up together as far as is comfortable.",
      "Lower them slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 2, 7),
    safety: "Stop at the point it pulls. Never force the arm.",
    contraindications: ["sternal_precautions"],
    needsHelper: false,
    milestoneTemplateKeys: ["neuro_lift_cup"],
  },
  {
    key: "side_steps",
    name: "Side steps",
    bodyArea: "balance",
    profileKinds: ["neuro", "geriatric"],
    picture: "side_steps",
    steps: [HOLD_ON, "Stand tall and look ahead.", "Step to the side, then bring the other foot to meet it.", "Step back the other way."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 3),
    safety: "Someone should stand beside you. Keep your toes facing forward.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
  },

  // ---- Parkinson's ---------------------------------------------------------------------
  {
    key: "big_steps",
    name: "Big steps",
    bodyArea: "walking",
    profileKinds: ["neuro_parkinsons"],
    picture: "big_steps",
    steps: ["Stand tall and look ahead.", "Take a big step forward, heel first.", "Swing your arms as you step.", "Count out loud to keep the rhythm."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Walk near a wall or a counter. Stop if your feet get stuck.",
    contraindications: ["cannot_stand"],
    needsHelper: false,
    milestoneTemplateKeys: ["pd_restart_with_beat"],
  },
  {
    key: "big_reach",
    name: "Big arm reach",
    bodyArea: "arms",
    profileKinds: ["neuro_parkinsons"],
    picture: "arm_raise",
    steps: ["Sit or stand tall.", "Reach both arms up high and wide.", "Open your hands and stretch your fingers.", "Bring your arms down slowly."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Make it big but comfortable. Stop if your shoulder hurts.",
    contraindications: ["sternal_precautions"],
    needsHelper: false,
  },
  {
    key: "wide_turn",
    name: "Wide turn",
    bodyArea: "balance",
    profileKinds: ["neuro_parkinsons"],
    picture: "wide_turn",
    steps: [
      "Stand in a clear space.",
      "Turn in a wide half circle with small steps.",
      "Keep your feet apart and count each step.",
      "Turn back the other way.",
    ],
    doseKind: "reps",
    defaultDose: reps(1, 5, 1, 5),
    safety: "Someone should stand beside you. Never pivot on one foot.",
    contraindications: ["cannot_stand", "high_fall_risk"],
    needsHelper: true,
    milestoneTemplateKeys: ["pd_turn_without_freezing"],
  },
  {
    key: "seated_turn",
    name: "Seated turn",
    bodyArea: "back",
    profileKinds: ["neuro_parkinsons"],
    picture: "seated_turn",
    steps: ["Sit tall on a firm chair.", "Cross your arms on your chest.", "Turn your shoulders slowly to one side.", "Come back and turn to the other side."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Turn gently. Stop if your back hurts.",
    contraindications: [],
    needsHelper: false,
  },

  // ---- Strength and balance (Otago-style basics) -------------------------------------------
  {
    key: "heel_to_toe_stand",
    name: "Heel-to-toe stand",
    bodyArea: "balance",
    profileKinds: ["geriatric"],
    picture: "heel_to_toe_stand",
    steps: [HOLD_ON, "Put one foot directly in front of the other.", "Stand tall and look ahead.", "Hold, then swap feet."],
    doseKind: "hold",
    defaultDose: hold(3, 10, 1, 3),
    safety: "Someone should stand beside you. Hold on whenever you need to.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
    harder: "heel_to_toe_walk",
    milestoneTemplateKeys: ["geri_heel_to_toe"],
  },
  {
    key: "heel_to_toe_walk",
    name: "Heel-to-toe walk",
    bodyArea: "balance",
    profileKinds: ["geriatric"],
    picture: "heel_to_toe_walk",
    steps: [
      "Stand beside a kitchen counter.",
      "Step forward so your heel touches your other toes.",
      "Take ten steps like this, looking ahead.",
      "Turn round slowly and walk back.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 3),
    safety: "Someone should stand beside you. Keep a hand near the counter.",
    contraindications: ["cannot_stand", "high_fall_risk"],
    needsHelper: true,
    easier: "heel_to_toe_stand",
  },
  {
    key: "one_leg_stand",
    name: "Stand on one leg",
    bodyArea: "balance",
    profileKinds: ["geriatric"],
    picture: "one_leg_stand",
    steps: [HOLD_ON, "Stand tall and look ahead.", "Lift one foot off the floor.", "Hold, then swap legs."],
    doseKind: "hold",
    defaultDose: hold(3, 10, 1, 3),
    safety: "Someone should stand beside you. Put your foot down if you wobble.",
    contraindications: ["cannot_stand", "high_fall_risk"],
    needsHelper: true,
    easier: "heel_to_toe_stand",
  },

  // ---- Heart and lung ---------------------------------------------------------------------------
  {
    key: "pursed_lip_breathing",
    name: "Pursed-lip breathing",
    bodyArea: "breathing",
    profileKinds: ["cardiopulmonary"],
    picture: "breathing",
    steps: [
      "Sit comfortably and relax your shoulders.",
      "Breathe in gently through your nose.",
      "Purse your lips as if to blow out a candle.",
      "Breathe out slowly, twice as long as you breathed in.",
    ],
    doseKind: "minutes",
    defaultDose: minutes(5, 3, 7),
    safety: "Never force the breath out. Stop if you feel dizzy.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "belly_breathing",
    name: "Tummy breathing",
    bodyArea: "breathing",
    profileKinds: ["cardiopulmonary"],
    picture: "breathing",
    steps: [
      "Sit back with one hand on your tummy.",
      "Breathe in slowly and feel your tummy rise.",
      "Breathe out slowly and feel it fall.",
      "Keep your shoulders still and relaxed.",
    ],
    doseKind: "minutes",
    defaultDose: minutes(5, 2, 7),
    safety: "Breathe gently. Stop if you feel dizzy.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "shoulder_rolls",
    name: "Shoulder rolls",
    bodyArea: "shoulder",
    profileKinds: ["cardiopulmonary", "ortho"],
    picture: "shoulder_rolls",
    steps: ["Sit or stand tall.", "Lift your shoulders up towards your ears.", "Roll them back and down.", "Keep the movement slow and smooth."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 2, 7),
    safety: "Keep the movement small if your chest is sore.",
    contraindications: [],
    needsHelper: false,
  },
  {
    key: "arm_raise_seated",
    name: "Seated arm raise",
    bodyArea: "arms",
    profileKinds: ["cardiopulmonary"],
    picture: "arm_raise",
    steps: ["Sit tall on a firm chair.", "Lift both arms forward and up as you breathe in.", "Lower them slowly as you breathe out."],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Stop if you get very short of breath or your chest hurts.",
    contraindications: ["sternal_precautions"],
    needsHelper: false,
    milestoneTemplateKeys: ["cardio_lift_5kg"],
  },

  // ---- Paediatric (play-based; a parent beside the child every time) -------------------------
  {
    key: "peds_crawl",
    name: "Crawl through a tunnel",
    bodyArea: "whole_body",
    profileKinds: ["pediatrics"],
    picture: "crawl",
    steps: [
      "Make a tunnel with chairs and a blanket.",
      "Put a favourite toy at the far end.",
      "Help your child crawl through to reach it.",
      "Cheer when they get there.",
    ],
    doseKind: "reps",
    defaultDose: reps(1, 5, 1, 5),
    safety: "Stay beside your child. Stop if they get upset or tired.",
    contraindications: [],
    needsHelper: true,
  },
  {
    key: "peds_tummy_time",
    name: "Tummy time play",
    bodyArea: "whole_body",
    profileKinds: ["pediatrics"],
    picture: "tummy_time",
    steps: [
      "Lay your baby on their tummy on a firm mat.",
      "Get down at their eye level.",
      "Hold a toy in front of them to look up at.",
    ],
    doseKind: "minutes",
    defaultDose: minutes(5, 3, 7),
    safety: "Only while your baby is awake and you are watching.",
    contraindications: [],
    needsHelper: true,
  },
  {
    key: "peds_kick_ball",
    name: "Kick the ball",
    bodyArea: "legs",
    profileKinds: ["pediatrics"],
    picture: "kick_ball",
    steps: [
      "Put a soft ball in front of your child.",
      "Hold their hands if they need it.",
      "Ask them to kick the ball to you.",
      "Swap legs each time.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Use a soft ball in a clear space. Stay close to catch them if they wobble.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
  },
  {
    key: "peds_cushion_stand",
    name: "Cushion balance",
    bodyArea: "balance",
    profileKinds: ["pediatrics"],
    picture: "cushion_stand",
    steps: [
      "Put a firm cushion on the floor.",
      "Help your child stand on it.",
      "Count together while they hold still.",
      "Help them step off.",
    ],
    doseKind: "hold",
    defaultDose: hold(3, 10, 1, 5),
    safety: "Stay within arm's reach the whole time.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
    milestoneTemplateKeys: ["peds_stand_10_seconds"],
  },
  {
    key: "peds_frog_jump",
    name: "Frog jumps",
    bodyArea: "legs",
    profileKinds: ["pediatrics"],
    picture: "frog_jump",
    steps: ["Squat down low like a frog.", "Jump forward with both feet together.", "Land softly with bent knees."],
    doseKind: "reps",
    defaultDose: reps(2, 5, 1, 3),
    safety: "Jump on a soft, clear floor. Stay close to your child.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
    easier: "peds_squat_pick_up",
  },
  {
    key: "peds_squat_pick_up",
    name: "Squat and pick up",
    bodyArea: "legs",
    profileKinds: ["pediatrics"],
    picture: "squat_pick_up",
    steps: [
      "Scatter some toys on the floor.",
      "Ask your child to squat down and pick one up.",
      "Help them stand back up tall.",
      "Put the toy in a basket together.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 10, 1, 5),
    safety: "Stay close to your child. Stop if they get tired.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
    harder: "peds_frog_jump",
    milestoneTemplateKeys: ["peds_squat_for_toy"],
  },
  {
    key: "peds_step_over",
    name: "Step over the toys",
    bodyArea: "balance",
    profileKinds: ["pediatrics"],
    picture: "step_over",
    steps: [
      "Line up a few soft toys on the floor.",
      "Hold your child's hand.",
      "Help them step over each toy in turn.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 5, 1, 5),
    safety: "Use soft toys only. Stay close to catch them if they trip.",
    contraindications: ["cannot_stand"],
    needsHelper: true,
    milestoneTemplateKeys: ["peds_walk_across_room"],
  },
  {
    key: "peds_bridge_play",
    name: "Bridge for a car",
    bodyArea: "hip",
    profileKinds: ["pediatrics"],
    picture: "bridge",
    steps: [
      "Your child lies on their back with knees bent.",
      "Ask them to lift their bottom to make a bridge.",
      "Drive a toy car under the bridge.",
      "Let them lower down slowly.",
    ],
    doseKind: "reps",
    defaultDose: reps(2, 8, 1, 5),
    safety: "Keep it a game. Stop if your child gets upset.",
    contraindications: [],
    needsHelper: true,
  },
];

export const EXERCISE_LIBRARY: readonly Exercise[] = DRAFTS.map((d) => ({ ...d, source: "code" as const, review: R }));

// --- Lookups ---------------------------------------------------------------------

const BY_KEY = new Map(EXERCISE_LIBRARY.map((e) => [e.key, e]));

export function exerciseByKey(key: string): Exercise | null {
  return BY_KEY.get(key) ?? null;
}

/** The library for a kind of patient, optionally one body area. */
export function exercisesFor(kind: ProfileKind, bodyArea?: BodyArea): Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.profileKinds.includes(kind) && (bodyArea === undefined || e.bodyArea === bodyArea));
}

/** The body areas that have an exercise for this kind, in BODY_AREAS order. */
export function bodyAreasFor(kind: ProfileKind): BodyArea[] {
  const present = new Set(exercisesFor(kind).map((e) => e.bodyArea));
  return (Object.keys(BODY_AREAS) as BodyArea[]).filter((a) => present.has(a));
}

// --- Module-load assertions -------------------------------------------------------
//
// Thrown at load (the sessionProtocols.ts posture): a duplicate key, a level
// pointing nowhere, a dose the plan validator would refuse, a clinic word in
// a line the patient reads, or a paediatric exercise without a parent beside
// the child is a cockpit offering what the server or the screen cannot keep.

export const DOSE_LIMITS = {
  sets: { min: 1, max: 5 },
  reps: { min: 1, max: 30 },
  holdSeconds: { min: 2, max: 60 },
  minutes: { min: 1, max: 60 },
  timesPerDay: { min: 1, max: 4 },
  daysPerWeek: { min: 1, max: 7 },
} as const;

const inRange = (v: number | null, r: { min: number; max: number }) => v !== null && Number.isInteger(v) && v >= r.min && v <= r.max;

/** Whether a dose has the shape its kind needs and is inside the bounds
 *  (the note is checked separately: it is the physiotherapist's own text). */
export function doseShapeProblem(kind: DoseKind, dose: ExerciseDose): string | null {
  if (!inRange(dose.timesPerDay, DOSE_LIMITS.timesPerDay)) return "times a day must be 1 to 4";
  if (!inRange(dose.daysPerWeek, DOSE_LIMITS.daysPerWeek)) return "days a week must be 1 to 7";
  switch (kind) {
    case "reps":
      if (!inRange(dose.sets, DOSE_LIMITS.sets)) return "sets must be 1 to 5";
      if (!inRange(dose.reps, DOSE_LIMITS.reps)) return "repetitions must be 1 to 30";
      if (dose.holdSeconds !== null || dose.minutes !== null) return "this exercise is counted in repetitions only";
      return null;
    case "reps_hold":
      if (!inRange(dose.sets, DOSE_LIMITS.sets)) return "sets must be 1 to 5";
      if (!inRange(dose.reps, DOSE_LIMITS.reps)) return "repetitions must be 1 to 30";
      if (!inRange(dose.holdSeconds, DOSE_LIMITS.holdSeconds)) return "the hold must be 2 to 60 seconds";
      if (dose.minutes !== null) return "this exercise is not timed in minutes";
      return null;
    case "hold":
      if (!inRange(dose.sets, DOSE_LIMITS.sets)) return "sets must be 1 to 5";
      if (!inRange(dose.holdSeconds, DOSE_LIMITS.holdSeconds)) return "the hold must be 2 to 60 seconds";
      if (dose.reps !== null || dose.minutes !== null) return "this exercise is one hold per set";
      return null;
    case "minutes":
      if (dose.sets !== 1) return "a timed exercise is one go";
      if (!inRange(dose.minutes, DOSE_LIMITS.minutes)) return "minutes must be 1 to 60";
      if (dose.reps !== null || dose.holdSeconds !== null) return "this exercise is timed in minutes only";
      return null;
  }
}

function patientTextProblems(where: string, text: string, maxChars: number, maxSentences: number): string[] {
  const out: string[] = [];
  if (!text.trim()) out.push(`${where}: empty`);
  if (text.length > maxChars) out.push(`${where}: longer than ${maxChars} characters`);
  if (sentenceCount(text) > maxSentences) out.push(`${where}: more than ${maxSentences} sentence${maxSentences === 1 ? "" : "s"}`);
  const bad = containsClinicWord(text);
  if (bad) out.push(`${where}: uses the clinic word "${bad}"`);
  return out;
}

export function libraryProblems(library: readonly Exercise[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const e of library) {
    if (keys.has(e.key)) problems.push(`duplicate exercise key "${e.key}"`);
    keys.add(e.key);
  }
  const byKey = new Map(library.map((e) => [e.key, e]));
  const templates = new Map(MILESTONE_TEMPLATES.map((t) => [t.key, t]));
  for (const e of library) {
    const where = e.key;
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(e.key)) problems.push(`${where}: key is not lower_snake_case`);
    if (e.review !== CLINICAL_REVIEW_MARK) problems.push(`${where}: not marked for clinical review`);
    if (!(e.bodyArea in BODY_AREAS)) problems.push(`${where}: unknown body area`);
    if (!(EXERCISE_PICTURES as readonly string[]).includes(e.picture)) problems.push(`${where}: unknown picture`);
    if (e.profileKinds.length === 0) problems.push(`${where}: no profile kind`);
    for (const k of e.profileKinds) if (!PROFILE_KINDS.includes(k)) problems.push(`${where}: unknown profile kind ${k}`);
    problems.push(...patientTextProblems(`${where}.name`, e.name, EXERCISE_NAME_MAX_CHARS, 1));
    if (/[.?!]$/.test(e.name)) problems.push(`${where}.name: a name is not a sentence`);
    if (e.steps.length < EXERCISE_STEPS_MIN || e.steps.length > EXERCISE_STEPS_MAX) problems.push(`${where}: needs 3 to 5 steps`);
    e.steps.forEach((s, i) => problems.push(...patientTextProblems(`${where}.steps[${i}]`, s, EXERCISE_STEP_MAX_CHARS, 1)));
    problems.push(...patientTextProblems(`${where}.safety`, e.safety, EXERCISE_SAFETY_MAX_CHARS, 2));
    for (const f of e.contraindications) if (!CONTRA_FLAGS.includes(f)) problems.push(`${where}: unknown contraindication ${f}`);
    const shape = doseShapeProblem(e.doseKind, e.defaultDose);
    if (shape) problems.push(`${where}: default dose -- ${shape}`);
    if (e.defaultDose.note !== null) problems.push(`${where}: a default dose carries no note`);
    if (e.profileKinds.includes("pediatrics") && !e.needsHelper) problems.push(`${where}: a child's exercise needs a parent beside them`);
    for (const [label, other] of [["easier", e.easier], ["harder", e.harder]] as const) {
      if (other === undefined) continue;
      const o = byKey.get(other);
      if (!o) problems.push(`${where}: ${label} version "${other}" is not in the library`);
      else if (o.key === e.key) problems.push(`${where}: ${label} version is itself`);
      else if (!o.profileKinds.some((k) => e.profileKinds.includes(k))) problems.push(`${where}: ${label} version shares no profile kind`);
    }
    for (const t of e.milestoneTemplateKeys ?? []) {
      const tpl = templates.get(t);
      if (!tpl) problems.push(`${where}: unknown milestone template "${t}"`);
      else if (!e.profileKinds.includes(tpl.profileKind)) problems.push(`${where}: milestone "${t}" is for another profile kind`);
    }
  }
  for (const kind of PROFILE_KINDS) {
    const n = library.filter((e) => e.profileKinds.includes(kind)).length;
    if (n < EXERCISES_PER_KIND_MIN) problems.push(`profile kind ${kind} has only ${n} exercises`);
  }
  return problems;
}

const LOAD_PROBLEMS = libraryProblems(EXERCISE_LIBRARY);
if (LOAD_PROBLEMS.length > 0) {
  throw new Error(`exerciseLibrary: ${LOAD_PROBLEMS.join("; ")}`);
}
