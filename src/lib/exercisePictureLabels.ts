import { EXERCISE_PICTURES, type ExercisePicture } from "@/lib/exerciseLibrary";

// What each home-exercise picture shows, in words, for a screen reader and
// for the pictures grid (phase 7d-2). Plain, patient-safe, one short phrase
// each. The drawings are src/components/exercises/ExercisePicture.tsx; this
// file is the pure half so a picture with no words, or a library picture with
// no drawing, is a failing test rather than a blank on somebody's screen.

export const EXERCISE_PICTURE_LABELS: Record<ExercisePicture, string> = {
  thigh_tighten: "Lying on the back with one leg straight, pressing the knee down",
  leg_lift_lying: "Lying on the back, lifting one straight leg",
  heel_slide: "Lying on the back, sliding one heel towards the bottom",
  sit_to_stand: "Standing up from a chair with arms crossed",
  sit_to_stand_hands: "Standing up from a chair, pushing up with the hands",
  bridge: "Lying on the back with knees bent, lifting the bottom",
  knee_to_chest: "Lying on the back, pulling one knee towards the chest",
  back_flatten: "Lying on the back with knees bent, pressing the lower back down",
  arm_pendulum: "Leaning forward on a table, letting one arm swing",
  shoulder_squeeze: "Standing tall, squeezing the shoulder blades together",
  wall_slide: "Standing facing a wall, sliding the arms up it",
  heel_raise: "Standing at a chair, rising onto the toes",
  toe_raise: "Standing at a chair, lifting the toes off the floor",
  knee_straighten_seated: "Sitting on a chair, straightening one knee",
  walking: "Walking forward at an easy pace",
  seated_reach: "Sitting on a chair, reaching one arm forward",
  weight_shift: "Standing, shifting weight from one side to the other",
  arm_raise: "Raising both arms up overhead",
  ankle_pumps: "Lying on the back, pointing the feet up and down",
  seated_march: "Sitting on a chair, lifting one knee at a time",
  side_steps: "Standing, stepping one foot out to the side",
  big_steps: "Walking with big, long steps and swinging arms",
  wide_turn: "Turning slowly in a wide circle",
  seated_turn: "Sitting tall, turning the upper body to one side",
  heel_to_toe_stand: "Standing with one foot directly in front of the other",
  heel_to_toe_walk: "Walking with each heel touching the toe of the other foot",
  one_leg_stand: "Standing on one leg, holding a support",
  breathing: "Sitting, breathing in and blowing out slowly through pursed lips",
  shoulder_rolls: "Standing, rolling the shoulders in circles",
  crawl: "A child crawling on hands and knees towards a tunnel",
  kick_ball: "A child kicking a ball",
  tummy_time: "A baby lying on the tummy, head up, reaching for a toy",
  cushion_stand: "A child standing on a cushion with arms out",
  frog_jump: "A child squatting and jumping forward like a frog",
  squat_pick_up: "A child squatting down to pick up a toy",
  step_over: "A child stepping over a toy on the floor",
};

/** The words for a picture, or the generic phrase for a key we do not know. */
export function exercisePictureLabel(picture: string): string {
  return (EXERCISE_PICTURE_LABELS as Record<string, string>)[picture] ?? "An exercise";
}

/** The accessible name: the exercise's own name, then what the drawing shows. */
export function exercisePictureAlt(picture: string, exerciseName?: string | null): string {
  const what = exercisePictureLabel(picture);
  return exerciseName ? `${exerciseName}: ${what.charAt(0).toLowerCase()}${what.slice(1)}` : what;
}

export const EXERCISE_PICTURE_KEYS: readonly ExercisePicture[] = EXERCISE_PICTURES;
