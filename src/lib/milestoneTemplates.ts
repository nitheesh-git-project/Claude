import type { ProfileKind } from "@/lib/outcomeMeasures";

// Starter milestones for each of the six profile kinds, and the four phases
// each kind's course moves through.
//
// Suggestions only. A template is copied into the physiotherapist's own
// milestone (care_milestones) and edited there before anyone sees it: the
// title, the bar, the target and the date are always theirs. Nothing reads a
// template after that copy, so editing this file never changes a plan a
// patient already has.
//
// Every template has a MEASURABLE criterion -- one task, one bar -- so that
// "reached" is a fact rather than an opinion (the handbook's rule). Where
// the bar is a number on a registered measure, `linkedMeasureKey` and
// `targetValue` say which, and milestones.ts can then work out the progress
// bar and suggest "reached" from the readings. The side of a sided measure
// (which knee) is chosen by the physiotherapist when they use the template.
//
// Drawn from the six Health Profile mockups' milestone cards, with the
// handbook's fixes applied (the patient's own oxygen limit rather than a
// fixed 92%, the affected hand rather than "the left hand"). Every target
// value is TO BE VERIFIED BY A SENIOR PHYSIOTHERAPIST AGAINST ITS SOURCE.
// Dependency-free, like everything the profile's maths reads.

export type MilestoneTemplate = {
  key: string;
  profileKind: ProfileKind;
  title: string;
  /** The measurable bar, in words the patient reads. */
  criterion: string;
  /** One of the profile kind's four phases. */
  phase: string;
  /** Typical order within the kind, 1 first. */
  order: number;
  linkedMeasureKey?: string;
  linkedVariant?: string;
  targetValue?: number;
};

/** Four stages of the course per kind; the current one is set by the
 *  physiotherapist, and moving on should follow criteria, not the week
 *  number. Orthopaedic uses the handbook's wording ("Back to activity") so
 *  it fits a patient who never played a sport. */
export const PHASES_BY_PROFILE_KIND: Record<ProfileKind, readonly string[]> = {
  ortho: ["Settle pain", "Restore movement", "Strengthen", "Back to activity"],
  neuro: ["Early recovery", "Build movement", "Independence", "Back in the community"],
  neuro_parkinsons: ["Assess", "Learn strategies", "Build capacity", "Keep it going"],
  pediatrics: ["Assess and play", "Building blocks", "New skills", "Everyday play"],
  geriatric: ["Assess and make safe", "Strength and balance", "Confidence outdoors", "Stay active"],
  cardiopulmonary: ["In hospital", "Early recovery", "Supervised exercise", "Lifelong activity"],
};

export const MILESTONE_TEMPLATES: readonly MilestoneTemplate[] = [
  // ---- Orthopaedic ----------------------------------------------------------------
  {
    key: "ortho_pain_3_or_less",
    profileKind: "ortho",
    title: "Pain 3 or less most days",
    criterion: "Pain score 3 or less out of 10, asked before treatment",
    phase: "Settle pain",
    order: 1,
    linkedMeasureKey: "pain_nprs",
    linkedVariant: "now",
    targetValue: 3,
  },
  {
    key: "ortho_walk_without_limp",
    profileKind: "ortho",
    title: "Walk without a limp",
    criterion: "Even steps over 100 m",
    phase: "Restore movement",
    order: 2,
  },
  {
    key: "ortho_knee_straightens_fully",
    profileKind: "ortho",
    title: "Straighten the knee fully",
    criterion: "Straightens fully on your own: 0 degrees, no lag",
    phase: "Restore movement",
    order: 3,
    linkedMeasureKey: "joint_range",
    linkedVariant: "knee_extension_active",
    targetValue: 0,
  },
  {
    key: "ortho_knee_bends_125",
    profileKind: "ortho",
    title: "Knee bends to 125 degrees",
    criterion: "Bends to 125 degrees on your own, measured lying on your back",
    phase: "Restore movement",
    order: 4,
    linkedMeasureKey: "joint_range",
    linkedVariant: "knee_flexion_active",
    targetValue: 125,
  },
  {
    key: "ortho_stairs_step_over_step",
    profileKind: "ortho",
    title: "Stairs step-over-step",
    criterion: "One flight, no rail, pain under 3",
    phase: "Strengthen",
    order: 5,
  },
  {
    key: "ortho_single_leg_squat",
    profileKind: "ortho",
    title: "Controlled single-leg squat",
    criterion: "10 in a row, knee stays in line over the foot",
    phase: "Strengthen",
    order: 6,
  },
  {
    key: "ortho_strength_90",
    profileKind: "ortho",
    title: "Leg strength at 90% of the other side",
    criterion: "Thigh strength 90% or more of the other leg, average of three pushes",
    phase: "Strengthen",
    order: 7,
    linkedMeasureKey: "strength_symmetry",
    linkedVariant: "quadriceps",
    targetValue: 90,
  },
  {
    key: "ortho_jog_10_minutes",
    profileKind: "ortho",
    title: "Jog 10 minutes pain-free",
    criterion: "Only once strength reaches 90% of the other leg; pain under 3 the next day",
    phase: "Back to activity",
    order: 8,
  },

  // ---- Neurological ---------------------------------------------------------------
  {
    key: "neuro_sit_unsupported",
    profileKind: "neuro",
    title: "Sit unsupported for a minute",
    criterion: "Edge of the bed, no hands, 60 seconds",
    phase: "Early recovery",
    order: 1,
  },
  {
    key: "neuro_stand_without_hands",
    profileKind: "neuro",
    title: "Stand up from a chair without hands",
    criterion: "3 times in a row",
    phase: "Build movement",
    order: 2,
  },
  {
    key: "neuro_walk_10m_stick",
    profileKind: "neuro",
    title: "Walk 10 m with a stick",
    criterion: "No one holding on: someone close by only (walking ability level 3)",
    phase: "Build movement",
    order: 3,
    linkedMeasureKey: "fac",
    targetValue: 3,
  },
  {
    key: "neuro_dress_top_half",
    profileKind: "neuro",
    title: "Dress the top half alone",
    criterion: "Shirt on without help; buttons may still need help",
    phase: "Independence",
    order: 4,
  },
  {
    key: "neuro_climb_5_stairs",
    profileKind: "neuro",
    title: "Climb 5 stairs with a rail",
    criterion: "5 stairs, rail, someone close by",
    phase: "Independence",
    order: 5,
  },
  {
    key: "neuro_lift_cup",
    profileKind: "neuro",
    title: "Lift a cup with the affected hand",
    criterion: "Grip holds a half-full cup to the mouth",
    phase: "Independence",
    order: 6,
  },
  {
    key: "neuro_walk_speed_short_trips",
    profileKind: "neuro",
    title: "Walk fast enough for short trips outside",
    criterion: "Comfortable walking speed of 0.4 m/s or more over 10 m",
    phase: "Back in the community",
    order: 7,
    linkedMeasureKey: "ten_metre_walk",
    targetValue: 0.4,
  },
  {
    key: "neuro_walk_to_gate",
    profileKind: "neuro",
    title: "Walk to the gate with a stick",
    criterion: "40 m outdoors, uneven ground",
    phase: "Back in the community",
    order: 8,
  },

  // ---- Parkinson's (a neurological sub-profile) -----------------------------------
  {
    key: "pd_restart_with_beat",
    profileKind: "neuro_parkinsons",
    title: "Restart walking with a beat when frozen",
    criterion: "Metronome cue, moving again within 5 seconds",
    phase: "Learn strategies",
    order: 1,
  },
  {
    key: "pd_get_up_from_floor",
    profileKind: "neuro_parkinsons",
    title: "Get up from the floor safely",
    criterion: "Half-kneel method, no help",
    phase: "Learn strategies",
    order: 2,
  },
  {
    key: "pd_turn_without_freezing",
    profileKind: "neuro_parkinsons",
    title: "Turn in the kitchen without freezing",
    criterion: "5 turns in a row",
    phase: "Build capacity",
    order: 3,
  },
  {
    key: "pd_tug_under_11_5",
    profileKind: "neuro_parkinsons",
    title: "Stand, walk and sit back in under 11.5 seconds",
    criterion: "Timed Up and Go 11.5 seconds or less, average of three, in ON",
    phase: "Build capacity",
    order: 4,
    linkedMeasureKey: "tug",
    targetValue: 11.5,
  },
  {
    key: "pd_walk_30_minutes",
    profileKind: "neuro_parkinsons",
    title: "Walk 30 minutes without a break",
    criterion: "30 minutes at your own pace, no rest",
    phase: "Build capacity",
    order: 5,
  },
  {
    key: "pd_three_months_no_fall",
    profileKind: "neuro_parkinsons",
    title: "Three months without a fall",
    criterion: "13 weeks with no fall in the diary",
    phase: "Keep it going",
    order: 6,
  },
  {
    key: "pd_market_with_bag",
    profileKind: "neuro_parkinsons",
    title: "Market and back with a bag",
    criterion: "1.2 km, 2 kg bag",
    phase: "Keep it going",
    order: 7,
  },

  // ---- Paediatric ---------------------------------------------------------------------
  {
    key: "peds_stand_5_seconds",
    profileKind: "pediatrics",
    title: "Stand alone for 5 seconds",
    criterion: "Hands free, feet apart, best of three tries",
    phase: "Building blocks",
    order: 1,
    linkedMeasureKey: "peds_standing_seconds",
    targetValue: 5,
  },
  {
    key: "peds_first_steps",
    profileKind: "pediatrics",
    title: "First steps on their own",
    criterion: "Two steps to a parent without holding on",
    phase: "New skills",
    order: 2,
    linkedMeasureKey: "peds_independent_steps",
    targetValue: 2,
  },
  {
    key: "peds_stand_10_seconds",
    profileKind: "pediatrics",
    title: "Stand alone for 10 seconds",
    criterion: "Not touching anyone or anything, best of three tries",
    phase: "Building blocks",
    order: 3,
    linkedMeasureKey: "peds_standing_seconds",
    targetValue: 10,
  },
  {
    key: "peds_5_steps",
    profileKind: "pediatrics",
    title: "5 steps without holding on",
    criterion: "Five steps in a row, upright, best of three",
    phase: "New skills",
    order: 4,
    linkedMeasureKey: "peds_independent_steps",
    targetValue: 5,
  },
  {
    key: "peds_squat_for_toy",
    profileKind: "pediatrics",
    title: "Squat for a toy and stand up",
    criterion: "Without using hands to rise",
    phase: "New skills",
    order: 5,
  },
  {
    key: "peds_walk_across_room",
    profileKind: "pediatrics",
    title: "Walk across the room",
    criterion: "About 3 metres, few falls",
    phase: "Everyday play",
    order: 6,
  },
  {
    key: "peds_climb_sofa",
    profileKind: "pediatrics",
    title: "Climb onto the sofa",
    criterion: "And get down feet first",
    phase: "Everyday play",
    order: 7,
  },

  // ---- Strength and balance (geriatric) -----------------------------------------------
  {
    key: "geri_home_check",
    profileKind: "geriatric",
    title: "Home made safer",
    criterion: "Home check done: grab rails, night lighting, loose rugs dealt with",
    phase: "Assess and make safe",
    order: 1,
  },
  {
    key: "geri_stand_without_arms",
    profileKind: "geriatric",
    title: "Stand from a chair without arms",
    criterion: "5 times in a row",
    phase: "Strength and balance",
    order: 2,
  },
  {
    key: "geri_heel_to_toe",
    profileKind: "geriatric",
    title: "Heel-to-toe stance for 10 seconds",
    criterion: "Without holding on (balance stage 3)",
    phase: "Strength and balance",
    order: 3,
    linkedMeasureKey: "four_stage_balance",
    targetValue: 3,
  },
  {
    key: "geri_kitchen_without_frame",
    profileKind: "geriatric",
    title: "Walk to the kitchen without the frame",
    criterion: "Stick only, 8 m",
    phase: "Strength and balance",
    order: 4,
  },
  {
    key: "geri_tug_under_12",
    profileKind: "geriatric",
    title: "Stand, walk and sit back in under 12 seconds",
    criterion: "Timed Up and Go under 12 seconds",
    phase: "Strength and balance",
    order: 5,
    linkedMeasureKey: "tug",
    targetValue: 11.9,
  },
  {
    key: "geri_floor_with_chair",
    profileKind: "geriatric",
    title: "Get up from the floor using a chair",
    criterion: "Someone standing by, no lifting",
    phase: "Strength and balance",
    order: 6,
  },
  {
    key: "geri_walk_to_gate",
    profileKind: "geriatric",
    title: "Walk to the gate and back",
    criterion: "40 m with a stick",
    phase: "Confidence outdoors",
    order: 7,
  },
  {
    key: "geri_bathe_standby",
    profileKind: "geriatric",
    title: "Bathe with someone only standing by",
    criterion: "Shower stool and rail, no hands-on help",
    phase: "Stay active",
    order: 8,
  },

  // ---- Heart and lung rehabilitation (cardiopulmonary) ------------------------------------
  {
    key: "cardio_walk_10_minutes",
    profileKind: "cardiopulmonary",
    title: "Walk 10 minutes without stopping",
    criterion: "Breathlessness 3 or less out of 10",
    phase: "Early recovery",
    order: 1,
  },
  {
    key: "cardio_two_flights",
    profileKind: "cardiopulmonary",
    title: "Climb two flights of stairs",
    criterion: "No chest pain, oxygen stays above your own limit",
    phase: "Supervised exercise",
    order: 2,
  },
  {
    key: "cardio_6mwt_400",
    profileKind: "cardiopulmonary",
    title: "Six-minute walk over 400 m",
    criterion: "400 m or more in six minutes",
    phase: "Supervised exercise",
    order: 3,
    linkedMeasureKey: "six_minute_walk",
    targetValue: 400,
  },
  {
    key: "cardio_lift_5kg",
    profileKind: "cardiopulmonary",
    title: "Lift 5 kg again",
    criterion: "Only once the surgeon clears the breastbone precautions",
    phase: "Supervised exercise",
    order: 4,
  },
  {
    key: "cardio_150_active_minutes",
    profileKind: "cardiopulmonary",
    title: "150 active minutes a week",
    criterion: "150 minutes a week at a pace where you can talk but not sing",
    phase: "Lifelong activity",
    order: 5,
    linkedMeasureKey: "active_minutes",
    targetValue: 150,
  },
  {
    key: "cardio_back_to_work",
    profileKind: "cardiopulmonary",
    title: "Back to work, half days",
    criterion: "Includes a 20-minute walk",
    phase: "Lifelong activity",
    order: 6,
  },
  {
    key: "cardio_walk_5km",
    profileKind: "cardiopulmonary",
    title: "Walk 5 km in under an hour",
    criterion: "Can still talk in sentences",
    phase: "Lifelong activity",
    order: 7,
  },
];

// A duplicate key would let one template shadow another in a picker.
// Thrown at module load, the same posture conditionIntake.ts takes over
// intake keys.
if (new Set(MILESTONE_TEMPLATES.map((t) => t.key)).size !== MILESTONE_TEMPLATES.length) {
  throw new Error("milestoneTemplates: duplicate template key");
}

/** The starter templates for one profile kind, in their typical order. */
export function milestoneTemplatesFor(kind: ProfileKind): MilestoneTemplate[] {
  return MILESTONE_TEMPLATES.filter((t) => t.profileKind === kind).sort((a, b) => a.order - b.order);
}

/** A planned milestone drafted from a template, for the physiotherapist to
 *  edit before saving. Carries no date and no side: both are theirs. */
export function draftMilestoneFromTemplate(template: MilestoneTemplate): {
  title: string;
  criterion: string;
  status: "planned";
  linkedMeasureKey: string | null;
  linkedVariant: string | null;
  targetValue: number | null;
  sortOrder: number;
  templateKey: string;
} {
  return {
    title: template.title,
    criterion: template.criterion,
    status: "planned",
    linkedMeasureKey: template.linkedMeasureKey ?? null,
    linkedVariant: template.linkedVariant ?? null,
    targetValue: template.targetValue ?? null,
    sortOrder: template.order,
    templateKey: template.key,
  };
}
