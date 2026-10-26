import type { LivePhase } from "@/lib/assessmentRun";
import { PICTURE_DESCRIPTIONS } from "@/lib/companionScreen";
import type { PatientPicture } from "@/lib/sessionProtocols";

// The position pictures the patient's screen can draw: seven plain inline
// SVGs for the fixed set the protocols name (sessionProtocols.ts
// PATIENT_PICTURES). Flat shapes in two colours on the dark screen, so they
// read from a distance and cost nothing to load. Literal colours, not
// theme tokens: the patient's screen is dark in both themes.

const BODY = "#5eead4";
const INK = "#0f172a";
const FURNITURE = "#475569";
const GROUND = "#334155";
const SOFT = "#94a3b8";

function Ground() {
  return <rect x="16" y="152" width="168" height="6" rx="3" fill={GROUND} />;
}

function Chair() {
  return (
    <>
      <rect x="70" y="106" width="74" height="9" rx="4" fill={FURNITURE} />
      <rect x="136" y="58" width="9" height="57" rx="4" fill={FURNITURE} />
      <rect x="75" y="114" width="7" height="40" rx="3" fill={FURNITURE} />
      <rect x="132" y="114" width="7" height="40" rx="3" fill={FURNITURE} />
    </>
  );
}

function Standing({ x = 100, scale = 1, color = BODY }: { x?: number; scale?: number; color?: string }) {
  return (
    <g transform={`translate(${x} 152) scale(${scale}) translate(-100 -152)`}>
      <circle cx="100" cy="32" r="14" fill={color} />
      <rect x="89" y="50" width="22" height="48" rx="11" fill={color} />
      <path d="M92 98 L92 148 M108 98 L108 148" stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
    </g>
  );
}

const ARMS_CROSSED = <path d="M92 64 L112 78 M108 64 L88 78" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />;

function Scene({ picture, standing }: { picture: PatientPicture; standing: boolean }) {
  switch (picture) {
    case "sitting":
      return (
        <>
          <Ground />
          <Chair />
          <g transform="translate(20 0)">
            <circle cx="98" cy="42" r="14" fill={BODY} />
            <rect x="87" y="58" width="22" height="48" rx="11" fill={BODY} />
            <g transform="translate(-2 -2)">{ARMS_CROSSED}</g>
            <path d="M98 104 L62 104 M62 104 L62 148" stroke={BODY} strokeWidth="10" strokeLinecap="round" fill="none" />
          </g>
        </>
      );
    case "chair_stand":
      return (
        <>
          <Ground />
          <Chair />
          {standing ? (
            <g>
              <circle cx="100" cy="30" r="14" fill={BODY} />
              <rect x="89" y="48" width="22" height="48" rx="11" fill={BODY} />
              <g transform="translate(0 -4)">{ARMS_CROSSED}</g>
              <path d="M94 96 L94 148 M106 96 L106 148" stroke={BODY} strokeWidth="10" strokeLinecap="round" fill="none" />
            </g>
          ) : (
            <g transform="translate(20 0)">
              <circle cx="98" cy="42" r="14" fill={BODY} />
              <rect x="87" y="58" width="22" height="48" rx="11" fill={BODY} />
              <g transform="translate(-2 -2)">{ARMS_CROSSED}</g>
              <path d="M98 104 L62 104 M62 104 L62 148" stroke={BODY} strokeWidth="10" strokeLinecap="round" fill="none" />
            </g>
          )}
          <path d="M40 80 L40 44 M30 54 L40 44 L50 54" stroke={SOFT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M40 100 L40 136 M30 126 L40 136 L50 126" stroke={SOFT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case "standing":
      return (
        <>
          <Ground />
          <Standing />
          <path d="M88 58 L80 96 M112 58 L120 96" stroke={BODY} strokeWidth="8" strokeLinecap="round" fill="none" />
        </>
      );
    case "lying":
      return (
        <>
          <rect x="14" y="132" width="172" height="10" rx="5" fill={FURNITURE} />
          <circle cx="40" cy="112" r="14" fill={BODY} />
          <rect x="54" y="101" width="58" height="22" rx="11" fill={BODY} />
          <path d="M112 112 L142 84 L172 120" stroke={BODY} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M112 118 L160 124" stroke={SOFT} strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.7" />
        </>
      );
    case "walking":
      return (
        <>
          <Ground />
          <circle cx="104" cy="30" r="14" fill={BODY} />
          <rect x="93" y="48" width="22" height="48" rx="11" fill={BODY} transform="rotate(6 104 72)" />
          <path d="M104 96 L82 148 M104 96 L128 146" stroke={BODY} strokeWidth="10" strokeLinecap="round" fill="none" />
          <path d="M96 60 L80 86 M112 60 L130 84" stroke={BODY} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d="M146 112 L184 112 M174 102 L184 112 L174 122" stroke={SOFT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case "balance":
      return (
        <>
          <Ground />
          <Standing x={82} />
          <path d="M70 58 L62 96 M94 58 L102 96" stroke={BODY} strokeWidth="8" strokeLinecap="round" fill="none" />
          <g opacity="0.75">
            <Standing x={150} scale={0.92} color={SOFT} />
          </g>
        </>
      );
    case "talking":
      return (
        <>
          <Ground />
          <circle cx="60" cy="96" r="16" fill={BODY} />
          <rect x="46" y="116" width="28" height="36" rx="14" fill={BODY} />
          <circle cx="142" cy="96" r="16" fill={SOFT} />
          <rect x="128" y="116" width="28" height="36" rx="14" fill={SOFT} />
          <rect x="48" y="34" width="52" height="30" rx="12" fill={BODY} opacity="0.9" />
          <path d="M62 64 L58 76 L74 64 Z" fill={BODY} opacity="0.9" />
          <circle cx="62" cy="49" r="3.5" fill={INK} />
          <circle cx="74" cy="49" r="3.5" fill={INK} />
          <circle cx="86" cy="49" r="3.5" fill={INK} />
        </>
      );
  }
}

/** The picture for a step; the chair stand sits until *go*, then stands. It describes itself to a screen reader; the words
 *  on the screen carry the instruction, the picture only shows the position. */
export default function PositionPicture({ picture, phase }: { picture: PatientPicture; phase?: LivePhase }) {
  return (
    <svg
      viewBox={picture === "lying" ? "0 64 200 90" : "0 0 200 170"}
      role="img"
      aria-label={PICTURE_DESCRIPTIONS[picture]}
      data-picture={picture}
      className={`h-auto shrink-0 ${picture === "lying" ? "w-[clamp(240px,42vw,440px)]" : "w-[clamp(160px,26vw,300px)]"}`}
    >
      <Scene picture={picture} standing={phase === "go"} />
    </svg>
  );
}
