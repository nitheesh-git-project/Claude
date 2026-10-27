import type { ReactNode } from "react";
import type { ExercisePicture as PictureKey } from "@/lib/exerciseLibrary";
import { exercisePictureAlt } from "@/lib/exercisePictureLabels";

// The home-exercise pictures (Health Profile redesign, phase 7d-2): 36 plain
// line-and-blob figures in the same style as the position pictures
// (src/components/patient/session/PositionPicture.tsx): a round head, a
// rounded body, thick round-ended limbs. A faint "start" figure and a
// solid "finish" figure with an arrow show the movement; a few flat props
// (chair, mat, wall, step) set the scene. One shared figure, so all 36 read
// as one set. Colours come from three CSS variables the `tone` prop sets, so
// the same drawing reads on the dark companion screen, the light dashboard
// and the therapist's cockpit. Display only: no text, nothing to press.

type Pt = readonly [number, number];
type Limb = readonly Pt[];
type Pose = {
  head: Pt;
  neck: Pt;
  hip: Pt;
  /** Two points (elbow, hand) start at the shoulder; three start where given. */
  arms: readonly [Limb, Limb];
  /** Two points (knee, foot) start at the hip; three start where given. */
  legs: readonly [Limb, Limb];
  /** A toe point per leg, when the foot shows. */
  toes?: readonly [Pt | null, Pt | null];
};

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const path = (pts: readonly Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");

function Limbs({ pose, which }: { pose: Pose; which: 0 | 1 }) {
  const shoulder = lerp(pose.neck, pose.hip, 0.1);
  const arm = pose.arms[which];
  const leg = pose.legs[which];
  const armPts = arm.length === 2 ? [shoulder, ...arm] : arm;
  const legPts = leg.length === 2 ? [pose.hip, ...leg] : leg;
  const toe = pose.toes?.[which] ?? null;
  const foot = legPts[legPts.length - 1];
  return (
    <>
      <path d={path(legPts)} strokeWidth="9" />
      {toe && <path d={path([foot, toe])} strokeWidth="7" />}
      <path d={path(armPts)} strokeWidth="7" />
    </>
  );
}

function Figure({ pose, ghost = false, size = 1 }: { pose: Pose; ghost?: boolean; size?: number }) {
  const body = (
    <g fill="none" stroke="var(--ex-body)" strokeLinecap="round" strokeLinejoin="round">
      <g opacity="0.62">
        <Limbs pose={pose} which={1} />
      </g>
      <path d={path([pose.neck, pose.hip])} strokeWidth="17" />
      <Limbs pose={pose} which={0} />
      <circle cx={pose.head[0]} cy={pose.head[1]} r="11" fill="var(--ex-body)" stroke="none" />
    </g>
  );
  const wrapped =
    size === 1 ? (
      body
    ) : (
      <g transform={`translate(${pose.hip[0]} 152) scale(${size}) translate(${-pose.hip[0]} -152)`}>{body}</g>
    );
  return ghost ? <g opacity="0.3">{wrapped}</g> : wrapped;
}

/** A curved or straight arrow, the head turned to the way the line ends. */
function Arrow({ from, to, bend }: { from: Pt; to: Pt; bend?: Pt }) {
  const c = bend ?? lerp(from, to, 0.5);
  const dx = to[0] - c[0];
  const dy = to[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = 8;
  const left: Pt = [to[0] - ux * size - uy * size * 0.6, to[1] - uy * size + ux * size * 0.6];
  const right: Pt = [to[0] - ux * size + uy * size * 0.6, to[1] - uy * size - ux * size * 0.6];
  return (
    <g fill="none" stroke="var(--ex-accent)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={bend ? `M${from[0]} ${from[1]} Q${bend[0]} ${bend[1]} ${to[0]} ${to[1]}` : `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`} />
      <path d={`M${left[0]} ${left[1]} L${to[0]} ${to[1]} L${right[0]} ${right[1]}`} />
    </g>
  );
}

const prop = { fill: "var(--ex-prop)" } as const;
const propLine = { stroke: "var(--ex-prop)", strokeLinecap: "round", fill: "none" } as const;

function Floor() {
  return <rect x="12" y="152" width="176" height="5" rx="2.5" {...prop} />;
}
function Mat() {
  return <rect x="8" y="141" width="184" height="9" rx="4.5" {...prop} />;
}
/** A chair facing right, seat top at y 110, back on the left. */
function Chair({ x = 56 }: { x?: number }) {
  return (
    <g {...prop}>
      <rect x={x} y="110" width="64" height="7" rx="3" />
      <rect x={x} y="62" width="7" height="55" rx="3" />
      <rect x={x + 2} y="116" width="6" height="36" rx="3" />
      <rect x={x + 54} y="116" width="6" height="36" rx="3" />
    </g>
  );
}
/** A chair back or counter to hold, on the right of a standing figure. */
function Support({ x = 140 }: { x?: number }) {
  return (
    <g {...prop}>
      <rect x={x} y="88" width="40" height="7" rx="3.5" />
      <rect x={x + 4} y="94" width="6" height="58" rx="3" />
      <rect x={x + 30} y="94" width="6" height="58" rx="3" />
    </g>
  );
}

// --- Shared poses ----------------------------------------------------------------------------

const standFront: Pose = {
  head: [100, 26],
  neck: [100, 42],
  hip: [100, 96],
  arms: [
    [[90, 48], [80, 70], [78, 92]],
    [[110, 48], [120, 70], [122, 92]],
  ],
  legs: [
    [[94, 96], [93, 124], [92, 150]],
    [[106, 96], [107, 124], [108, 150]],
  ],
};

const standSide: Pose = {
  head: [100, 26],
  neck: [100, 42],
  hip: [98, 96],
  arms: [
    [[100, 68], [102, 90]],
    [[102, 68], [104, 90]],
  ],
  legs: [
    [[99, 124], [98, 150]],
    [[101, 124], [102, 150]],
  ],
  toes: [[110, 150], [114, 150]],
};

const seated: Pose = {
  head: [84, 36],
  neck: [84, 52],
  hip: [84, 102],
  arms: [
    [[96, 78], [112, 98]],
    [[98, 78], [114, 98]],
  ],
  legs: [
    [[118, 104], [120, 146]],
    [[122, 104], [124, 146]],
  ],
  toes: [[132, 148], [136, 148]],
};

const lying: Pose = {
  head: [26, 128],
  neck: [40, 129],
  hip: [88, 129],
  arms: [
    [[62, 134], [84, 134]],
    [[64, 133], [86, 133]],
  ],
  legs: [
    [[122, 129], [156, 129]],
    [[122, 129], [156, 129]],
  ],
  toes: [[162, 121], null],
};

const withPose = (base: Pose, over: Partial<Pose>): Pose => ({ ...base, ...over });

// --- The 36 scenes ---------------------------------------------------------------------------------

function Scene({ picture }: { picture: string }): ReactNode {
  switch (picture) {
    case "thigh_tighten":
      return (
        <>
          <Mat />
          <Figure pose={withPose(lying, { legs: [[[122, 129], [156, 129]], [[116, 106], [128, 130]]], toes: [[162, 121], null] })} />
          <Arrow from={[122, 92]} to={[122, 114]} />
        </>
      );
    case "leg_lift_lying":
      return (
        <>
          <Mat />
          <Figure ghost pose={lying} />
          <Figure pose={withPose(lying, { legs: [[[122, 106], [152, 84]], [[114, 100], [124, 128]]], toes: [[160, 78], null] })} />
          <Arrow from={[170, 118]} to={[170, 82]} bend={[180, 100]} />
        </>
      );
    case "heel_slide":
      return (
        <>
          <Mat />
          <Figure ghost pose={withPose(lying, { legs: [[[122, 129], [156, 129]], [[122, 129], [156, 129]]] })} />
          <Figure pose={withPose(lying, { legs: [[[118, 102], [130, 130]], [[122, 129], [156, 129]]], toes: [[136, 124], null] })} />
          <Arrow from={[176, 134]} to={[146, 134]} />
        </>
      );
    case "bridge":
      return (
        <>
          <Mat />
          <Figure ghost pose={withPose(lying, { legs: [[[118, 106], [134, 130]], [[118, 106], [134, 130]]] })} />
          <Figure
            pose={withPose(lying, {
              neck: [46, 128],
              hip: [88, 100],
              legs: [[[120, 100], [132, 130]], [[120, 100], [132, 130]]],
              toes: [[142, 128], null],
              arms: [[[64, 134], [86, 134]], [[66, 133], [88, 133]]],
            })}
          />
          <Arrow from={[88, 82]} to={[88, 62]} />
        </>
      );
    case "knee_to_chest":
      return (
        <>
          <Mat />
          <Figure
            pose={withPose(lying, {
              legs: [[[118, 98], [140, 112]], [[122, 129], [156, 129]]],
              toes: [[148, 110], [162, 121]],
              arms: [[[76, 112], [112, 96]], [[78, 112], [114, 98]]],
            })}
          />
          <Arrow from={[150, 80]} to={[128, 90]} bend={[142, 82]} />
        </>
      );
    case "back_flatten":
      return (
        <>
          <Mat />
          <Figure pose={withPose(lying, { legs: [[[118, 104], [134, 130]], [[118, 104], [134, 130]]], toes: [[144, 128], null] })} />
          <Arrow from={[78, 90]} to={[78, 114]} />
        </>
      );
    case "sit_to_stand":
    case "sit_to_stand_hands": {
      const hands = picture === "sit_to_stand_hands";
      const standing: Pose = {
        head: [92, 22],
        neck: [92, 38],
        hip: [94, 90],
        arms: hands
          ? [[[104, 62], [112, 90]], [[106, 62], [114, 92]]]
          : [[[102, 60], [92, 50]], [[104, 62], [90, 54]]],
        legs: [[[98, 120], [98, 150]], [[102, 120], [102, 150]]],
        toes: [[110, 150], [114, 150]],
      };
      return (
        <>
          <Floor />
          <Chair x={56} />
          {hands && (
            <rect x="100" y="86" width="26" height="6" rx="3" {...prop} />
          )}
          <Figure ghost pose={hands ? withPose(seated, { arms: [[[104, 90], [112, 90]], [[106, 90], [114, 92]]] }) : withPose(seated, { arms: [[[98, 76], [86, 66]], [[100, 76], [82, 70]]] })} />
          <g transform="translate(40 0)">
            <Figure pose={standing} />
          </g>
          <Arrow from={[180, 110]} to={[180, 50]} />
        </>
      );
    }
    case "arm_pendulum":
      return (
        <>
          <Floor />
          <g {...prop}>
            <rect x="128" y="96" width="52" height="7" rx="3.5" />
            <rect x="134" y="102" width="6" height="50" rx="3" />
            <rect x="168" y="102" width="6" height="50" rx="3" />
          </g>
          <Figure ghost pose={{ ...standSide, head: [112, 54], neck: [104, 64], hip: [80, 100], arms: [[[130, 92], [152, 82]], [[118, 84], [134, 96]]], legs: [[[82, 126], [84, 150]], [[84, 126], [86, 150]]] }} />
          <Figure
            pose={{
              head: [112, 54],
              neck: [104, 64],
              hip: [80, 100],
              arms: [[[118, 86], [134, 98]], [[108, 92], [100, 118]]],
              legs: [[[82, 126], [84, 150]], [[84, 126], [86, 150]]],
              toes: [[96, 150], [98, 150]],
            }}
          />
          <Arrow from={[84, 124]} to={[124, 126]} bend={[104, 142]} />
        </>
      );
    case "shoulder_squeeze":
      return (
        <>
          <Floor />
          <Figure
            pose={withPose(standFront, {
              arms: [
                [[90, 48], [72, 60], [84, 74]],
                [[110, 48], [128, 60], [116, 74]],
              ],
            })}
          />
          <Arrow from={[52, 50]} to={[70, 50]} />
          <Arrow from={[148, 50]} to={[130, 50]} />
        </>
      );
    case "wall_slide":
      return (
        <>
          <Floor />
          <rect x="150" y="6" width="9" height="148" rx="3" {...prop} />
          <Figure
            ghost
            pose={withPose(standSide, { arms: [[[134, 62], [147, 74]], [[132, 64], [147, 76]]] })}
          />
          <Figure pose={withPose(standSide, { arms: [[[134, 36], [147, 18]], [[132, 38], [147, 20]]] })} />
          <Arrow from={[170, 84]} to={[170, 22]} />
        </>
      );
    case "heel_raise":
      return (
        <>
          <Floor />
          <Support x={134} />
          <Figure
            ghost
            pose={withPose(standSide, { arms: [[[116, 66], [138, 90]], [[118, 66], [140, 91]]] })}
          />
          <Figure
            pose={{
              head: [100, 20],
              neck: [100, 36],
              hip: [98, 90],
              arms: [[[116, 62], [138, 88]], [[118, 62], [140, 89]]],
              legs: [[[99, 118], [98, 144]], [[101, 118], [102, 144]]],
              toes: [[110, 151], [114, 151]],
            }}
          />
          <Arrow from={[76, 144]} to={[76, 120]} />
        </>
      );
    case "toe_raise":
      return (
        <>
          <Floor />
          <Support x={134} />
          <Figure
            pose={{
              ...standSide,
              arms: [[[116, 66], [138, 90]], [[118, 66], [140, 91]]],
              toes: [[110, 138], [114, 138]],
            }}
          />
          <Arrow from={[126, 150]} to={[126, 128]} />
        </>
      );
    case "knee_straighten_seated":
      return (
        <>
          <Floor />
          <Chair />
          <Figure ghost pose={seated} />
          <Figure
            pose={withPose(seated, {
              legs: [[[118, 106], [154, 108]], [[122, 104], [124, 146]]],
              toes: [[160, 98], [136, 148]],
            })}
          />
          <Arrow from={[164, 138]} to={[168, 112]} bend={[176, 128]} />
        </>
      );
    case "walking":
      return (
        <>
          <Floor />
          <Figure
            pose={{
              head: [100, 26],
              neck: [102, 42],
              hip: [100, 96],
              arms: [[[94, 70], [84, 90]], [[108, 70], [120, 88]]],
              legs: [[[90, 122], [76, 148]], [[112, 122], [124, 148]]],
              toes: [[88, 150], [136, 150]],
            }}
          />
          <Arrow from={[146, 64]} to={[186, 64]} />
        </>
      );
    case "seated_reach":
      return (
        <>
          <Floor />
          <Chair />
          <Figure ghost pose={seated} />
          <Figure pose={withPose(seated, { neck: [92, 52], head: [96, 36], arms: [[[112, 56], [140, 60]], [[114, 58], [142, 62]]] })} />
          <Arrow from={[146, 36]} to={[172, 36]} />
        </>
      );
    case "weight_shift": {
      const shifted = (dx: number): Pose => ({
        head: [100 + dx, 26],
        neck: [100 + dx, 42],
        hip: [100 + dx * 0.6, 96],
        arms: [
          [[90 + dx, 48], [78 + dx, 68], [90 + dx * 0.7, 90]],
          [[110 + dx, 48], [122 + dx, 68], [110 + dx * 0.7, 90]],
        ],
        legs: [
          [[84 + dx * 0.6, 96], [86, 124], [82, 150]],
          [[116 + dx * 0.6, 96], [114, 124], [118, 150]],
        ],
      });
      return (
        <>
          <Floor />
          <Figure ghost pose={shifted(-14)} />
          <Figure pose={shifted(12)} />
          <Arrow from={[132, 12]} to={[172, 12]} />
          <Arrow from={[68, 12]} to={[28, 12]} />
        </>
      );
    }
    case "arm_raise":
      return (
        <>
          <Floor />
          <Figure ghost pose={standFront} />
          <Figure
            pose={withPose(standFront, {
              arms: [
                [[90, 48], [82, 26], [84, 4]],
                [[110, 48], [118, 26], [116, 4]],
              ],
              head: [100, 28],
            })}
          />
          <Arrow from={[40, 82]} to={[40, 30]} />
        </>
      );
    case "ankle_pumps":
      return (
        <>
          <Mat />
          <Figure
            ghost
            pose={withPose(lying, { toes: [[162, 138], [162, 138]] })}
          />
          <Figure pose={withPose(lying, { legs: [[[122, 129], [156, 129]], [[122, 130], [156, 130]]], toes: [[164, 112], [164, 114]] })} />
          <Arrow from={[178, 150]} to={[180, 112]} bend={[192, 132]} />
        </>
      );
    case "seated_march":
      return (
        <>
          <Floor />
          <Chair />
          <Figure
            pose={withPose(seated, {
              legs: [[[118, 90], [122, 118]], [[122, 104], [124, 146]]],
              toes: [[134, 120], [136, 148]],
            })}
          />
          <Arrow from={[150, 112]} to={[150, 76]} />
        </>
      );
    case "side_steps":
      return (
        <>
          <Floor />
          <Figure ghost pose={standFront} />
          <Figure
            pose={withPose(standFront, {
              legs: [[[94, 96], [93, 124], [92, 150]], [[106, 96], [122, 122], [140, 150]]],
            })}
          />
          <Arrow from={[120, 168]} to={[164, 168]} />
        </>
      );
    case "big_steps":
      return (
        <>
          <Floor />
          <rect x="30" y="147" width="18" height="5" rx="2" fill="var(--ex-accent)" />
          <rect x="150" y="147" width="18" height="5" rx="2" fill="var(--ex-accent)" />
          <Figure
            pose={{
              head: [104, 24],
              neck: [106, 40],
              hip: [102, 94],
              arms: [[[96, 66], [78, 82]], [[116, 66], [136, 54]]],
              legs: [[[86, 122], [60, 148]], [[122, 120], [152, 144]]],
              toes: [[72, 150], [160, 148]],
            }}
          />
          <Arrow from={[120, 18]} to={[176, 18]} />
        </>
      );
    case "wide_turn":
      return (
        <>
          <Floor />
          <ellipse cx="100" cy="146" rx="78" ry="14" fill="none" stroke="var(--ex-prop)" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
          <Figure pose={standFront} size={0.82} />
          <Arrow from={[34, 134]} to={[60, 158]} bend={[30, 152]} />
          <Arrow from={[166, 134]} to={[140, 158]} bend={[170, 152]} />
        </>
      );
    case "seated_turn":
      return (
        <>
          <Floor />
          <g {...prop}>
            <rect x="66" y="108" width="68" height="7" rx="3" />
            <rect x="72" y="114" width="6" height="38" rx="3" />
            <rect x="122" y="114" width="6" height="38" rx="3" />
          </g>
          <Figure
            pose={{
              head: [112, 34],
              neck: [104, 52],
              hip: [100, 102],
              arms: [[[92, 54], [100, 74], [118, 66]], [[112, 54], [108, 72], [92, 68]]],
              legs: [[[90, 104], [88, 128], [88, 150]], [[110, 104], [112, 128], [112, 150]]],
            }}
          />
          <Arrow from={[62, 26]} to={[140, 26]} bend={[101, -6]} />
        </>
      );
    case "heel_to_toe_stand":
      return (
        <>
          <Floor />
          <Support x={144} />
          <Figure
            pose={{
              head: [100, 24],
              neck: [100, 40],
              hip: [98, 94],
              arms: [[[116, 66], [146, 90]], [[84, 70], [72, 90]]],
              legs: [[[96, 122], [90, 148]], [[102, 122], [114, 148]]],
              toes: [[106, 150], [128, 150]],
            }}
          />
          <circle cx="107" cy="150" r="4" fill="var(--ex-accent)" />
        </>
      );
    case "heel_to_toe_walk":
      return (
        <>
          <Floor />
          <g fill="var(--ex-prop)">
            <rect x="24" y="148" width="14" height="4" rx="2" />
            <rect x="46" y="148" width="14" height="4" rx="2" />
            <rect x="140" y="148" width="14" height="4" rx="2" />
            <rect x="162" y="148" width="14" height="4" rx="2" />
          </g>
          <Figure
            pose={{
              head: [100, 24],
              neck: [100, 40],
              hip: [98, 94],
              arms: [[[80, 66], [64, 62]], [[118, 66], [134, 62]]],
              legs: [[[92, 122], [82, 148]], [[108, 122], [120, 148]]],
              toes: [[94, 150], [132, 150]],
            }}
          />
          <Arrow from={[120, 12]} to={[172, 12]} />
        </>
      );
    case "one_leg_stand":
      return (
        <>
          <Floor />
          <Support x={134} />
          <Figure
            pose={{
              head: [100, 24],
              neck: [100, 40],
              hip: [98, 94],
              arms: [[[116, 66], [138, 90]], [[84, 68], [70, 62]]],
              legs: [[[99, 122], [98, 150]], [[118, 106], [108, 134]]],
              toes: [[110, 150], [122, 138]],
            }}
          />
        </>
      );
    case "breathing":
      return (
        <>
          <Floor />
          <Chair />
          <Figure
            pose={withPose(seated, { arms: [[[100, 76], [106, 92]], [[96, 80], [96, 96]]] })}
          />
          <g fill="none" stroke="var(--ex-accent)" strokeWidth="3.5" strokeLinecap="round" opacity="0.9">
            <path d="M104 40 Q124 36 146 40" />
            <path d="M104 46 Q130 46 154 52" />
            <path d="M104 34 Q126 26 148 28" />
          </g>
        </>
      );
    case "shoulder_rolls":
      return (
        <>
          <Floor />
          <Figure pose={standFront} />
          <Arrow from={[70, 50]} to={[80, 34]} bend={[56, 34]} />
          <Arrow from={[130, 50]} to={[120, 34]} bend={[144, 34]} />
        </>
      );
    case "crawl":
      return (
        <>
          <Floor />
          <path d="M120 152 L120 110 Q150 70 180 110 L180 152" {...propLine} strokeWidth="9" />
          <Figure
            pose={{
              head: [58, 90],
              neck: [72, 96],
              hip: [112, 102],
              arms: [[[72, 122], [70, 148]], [[78, 122], [78, 148]]],
              legs: [[[114, 140], [92, 150]], [[122, 140], [100, 150]]],
            }}
          />
          <Arrow from={[40, 66]} to={[84, 66]} />
        </>
      );
    case "kick_ball":
      return (
        <>
          <Floor />
          <circle cx="164" cy="142" r="9" fill="var(--ex-accent)" />
          <Figure
            pose={{
              head: [90, 26],
              neck: [90, 42],
              hip: [90, 96],
              arms: [[[80, 66], [66, 56]], [[100, 66], [112, 84]]],
              legs: [[[90, 124], [88, 150]], [[116, 112], [142, 132]]],
              toes: [[100, 150], [150, 136]],
            }}
          />
          <path d="M150 122 L170 118 M154 112 L176 108" {...propLine} strokeWidth="3" />
        </>
      );
    case "tummy_time":
      return (
        <>
          <Mat />
          <circle cx="170" cy="126" r="9" fill="var(--ex-accent)" />
          <Figure
            pose={{
              head: [128, 92],
              neck: [112, 110],
              hip: [58, 130],
              arms: [[[116, 132], [124, 138]], [[110, 134], [118, 139]]],
              legs: [[[34, 131], [12, 132]], [[34, 133], [12, 134]]],
            }}
          />
          <Arrow from={[142, 66]} to={[166, 82]} bend={[162, 62]} />
        </>
      );
    case "cushion_stand":
      return (
        <>
          <Floor />
          <rect x="60" y="143" width="80" height="12" rx="6" {...prop} />
          <Figure
            pose={withPose(standFront, {
              arms: [
                [[90, 48], [64, 52], [44, 44]],
                [[110, 48], [136, 52], [156, 44]],
              ],
              legs: [
                [[94, 96], [93, 122], [92, 146]],
                [[106, 96], [107, 122], [108, 146]],
              ],
            })}
            size={0.9}
          />
        </>
      );
    case "frog_jump":
      return (
        <>
          <Floor />
          <Figure
            pose={{
              head: [112, 72],
              neck: [100, 86],
              hip: [74, 124],
              arms: [[[116, 112], [126, 146]], [[110, 114], [120, 148]]],
              legs: [[[106, 116], [96, 148]], [[110, 120], [102, 148]]],
              toes: [[108, 150], [112, 150]],
            }}
          />
          <Arrow from={[84, 52]} to={[170, 96]} bend={[148, 10]} />
        </>
      );
    case "squat_pick_up":
      return (
        <>
          <Floor />
          <rect x="140" y="138" width="16" height="14" rx="3" fill="var(--ex-accent)" />
          <Figure
            pose={{
              head: [106, 66],
              neck: [96, 82],
              hip: [78, 122],
              arms: [[[114, 104], [136, 138]], [[110, 106], [132, 140]]],
              legs: [[[106, 116], [100, 148]], [[110, 120], [104, 148]]],
              toes: [[112, 150], [116, 150]],
            }}
          />
          <Arrow from={[150, 100]} to={[150, 124]} />
        </>
      );
    case "step_over":
      return (
        <>
          <Floor />
          <rect x="112" y="130" width="24" height="22" rx="4" fill="var(--ex-accent)" />
          <Figure
            pose={{
              head: [92, 24],
              neck: [92, 40],
              hip: [92, 94],
              arms: [[[80, 66], [64, 80]], [[104, 66], [118, 76]]],
              legs: [[[92, 124], [90, 150]], [[116, 104], [134, 112]]],
              toes: [[102, 150], [142, 124]],
            }}
          />
          <Arrow from={[96, 108]} to={[150, 140]} bend={[140, 90]} />
        </>
      );
    default:
      return (
        <>
          <Floor />
          <Figure pose={standSide} />
        </>
      );
  }
}

export type PictureTone = "light" | "dark";

const TONES: Record<PictureTone, { body: string; accent: string; prop: string }> = {
  // The patient's companion screen: teal figure, amber movement arrows.
  dark: { body: "#5eead4", accent: "#fbbf24", prop: "#64748b" },
  // The dashboards: deep teal figure, dark amber arrows on white.
  light: { body: "#0f766e", accent: "#b45309", prop: "#94a3b8" },
};

/**
 * One home-exercise picture. `picture` is a key from EXERCISE_PICTURES; an
 * unknown key draws a plain standing figure rather than nothing. `name`
 * (the exercise's own name) leads the accessible label. `className` sizes it.
 */
export default function ExercisePicture({
  picture,
  name,
  tone = "light",
  className = "h-auto w-full",
}: {
  picture: PictureKey | string;
  name?: string | null;
  tone?: PictureTone;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <svg
      viewBox="0 0 200 170"
      role="img"
      aria-label={exercisePictureAlt(picture, name)}
      data-picture={picture}
      className={className}
      style={{ ["--ex-body" as string]: c.body, ["--ex-accent" as string]: c.accent, ["--ex-prop" as string]: c.prop }}
    >
      <Scene picture={picture} />
    </svg>
  );
}
