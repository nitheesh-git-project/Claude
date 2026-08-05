"use client";

import {
  motion,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import {
  VERTEBRAE,
  VIEWBOX,
  type Vertebra,
} from "./spineGeometry";

/**
 * Scroll-driven anatomical spine.
 *
 * `progress` is a 0..1 MotionValue (normally a section's scrollYProgress).
 * A scan travels down the column as it advances: vertebrae ahead of the
 * scan sit quiet, the band under it flares, and everything behind it stays
 * lightly tinted — so the visual reads as an assessment moving down the
 * spine rather than as ambient decoration.
 */

/** Smooth polyline through the vertebral bodies, used for the cord path. */
function cordPath(): string {
  const pts = VERTEBRAE.map((v) => ({ x: v.x - v.width * 0.28, y: v.y }));
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const mx = ((prev.x + cur.x) / 2).toFixed(2);
    const my = ((prev.y + cur.y) / 2).toFixed(2);
    d += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

const CORD_D = cordPath();

/** Interpolated position along the column for a 0..1 scan value. */
function positionAt(p: number): { x: number; y: number } {
  const clamped = Math.min(1, Math.max(0, p));
  const scaled = clamped * (VERTEBRAE.length - 1);
  const i = Math.min(VERTEBRAE.length - 2, Math.floor(scaled));
  const frac = scaled - i;
  const a = VERTEBRAE[i];
  const b = VERTEBRAE[i + 1];
  return {
    x: a.x + (b.x - a.x) * frac - a.width * 0.28,
    y: a.y + (b.y - a.y) * frac,
  };
}

/** Quantised so server- and client-generated path strings match exactly. */
function n(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function vertebraBodyPath(v: Vertebra): string {
  const w = v.width;
  const h = v.height;
  const r = n(h * 0.34);
  const x = n(-w / 2);
  const y = n(-h / 2);
  return `M ${n(x + r)} ${y} H ${n(x + w - r)} A ${r} ${r} 0 0 1 ${n(x + w)} ${n(
    y + r
  )} V ${n(y + h - r)} A ${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)} H ${n(
    x + r
  )} A ${r} ${r} 0 0 1 ${x} ${n(y + h - r)} V ${n(y + r)} A ${r} ${r} 0 0 1 ${n(
    x + r
  )} ${y} Z`;
}

/** Posteriorly-projecting spinous process, raked downward. */
function spinousPath(v: Vertebra): string {
  const w = v.width;
  const h = v.height;
  const len = w * 0.7;
  const rad = (v.processAngle * Math.PI) / 180;
  const baseX = n(-w / 2 + 1);
  const tipX = n(-w / 2 - len * Math.cos(rad));
  const tipY = n(h * 0.08 + len * Math.sin(rad));
  const tipHalf = n(h * 0.16);
  return `M ${baseX} ${n(-h * 0.3)} L ${tipX} ${n(tipY - tipHalf)} L ${tipX} ${n(
    tipY + tipHalf
  )} L ${baseX} ${n(h * 0.3)} Z`;
}

function VertebraShape({
  v,
  progress,
}: {
  v: Vertebra;
  progress: MotionValue<number>;
}) {
  // The column stays legible at rest; the scan adds emphasis on top of it
  // rather than being the only thing that makes a vertebra visible.
  const fillOpacity = useTransform(progress, (p) => {
    const glow = Math.max(0, 1 - Math.abs(v.t - p) * 5);
    const scanned = Math.min(1, Math.max(0, (p - v.t) * 14));
    return 0.16 + scanned * 0.12 + glow * 0.4;
  });
  const strokeOpacity = useTransform(progress, (p) => {
    const glow = Math.max(0, 1 - Math.abs(v.t - p) * 5);
    const scanned = Math.min(1, Math.max(0, (p - v.t) * 14));
    return 0.5 + scanned * 0.15 + glow * 0.35;
  });
  const scale = useTransform(progress, (p) => {
    const glow = Math.max(0, 1 - Math.abs(v.t - p) * 5);
    return 1 + glow * 0.06;
  });

  // Placement stays on a plain <g> via the SVG transform attribute; the
  // animated scale goes on an inner <motion.g>, because Framer Motion
  // writes a CSS transform that would otherwise override — and discard —
  // the attribute, collapsing every vertebra onto the origin.
  return (
    <g
      transform={`translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) rotate(${v.rotation.toFixed(2)})`}
    >
      <motion.g
        style={{ scale, transformBox: "fill-box", transformOrigin: "center" }}
      >
        <motion.path
          d={spinousPath(v)}
          fill="#0d9488"
          stroke="#5eead4"
          strokeWidth={1.4}
          strokeLinejoin="round"
          style={{ fillOpacity, strokeOpacity }}
        />
        <motion.path
          d={vertebraBodyPath(v)}
          fill="#14b8a6"
          stroke="#5eead4"
          strokeWidth={1.8}
          style={{ fillOpacity, strokeOpacity }}
        />
      </motion.g>
    </g>
  );
}

function Disc({
  a,
  b,
  progress,
}: {
  a: Vertebra;
  b: Vertebra;
  progress: MotionValue<number>;
}) {
  const midT = (a.t + b.t) / 2;
  const opacity = useTransform(progress, (p) => {
    const glow = Math.max(0, 1 - Math.abs(midT - p) * 5);
    return 0.12 + glow * 0.35;
  });
  return (
    <motion.ellipse
      cx={Math.round(((a.x + b.x) / 2) * 1000) / 1000}
      cy={Math.round(((a.y + b.y) / 2) * 1000) / 1000}
      rx={Math.round(((a.width + b.width) / 2) * 0.3 * 1000) / 1000}
      ry={2.4}
      fill="#5eead4"
      style={{ opacity }}
    />
  );
}

function SacrumShape({ progress }: { progress: MotionValue<number> }) {
  const last = VERTEBRAE[VERTEBRAE.length - 1];
  const fillOpacity = useTransform(progress, (p) => {
    const glow = Math.max(0, 1 - Math.abs(1 - p) * 4);
    return 0.16 + glow * 0.34;
  });
  const strokeOpacity = useTransform(progress, (p) => {
    const glow = Math.max(0, 1 - Math.abs(1 - p) * 4);
    return 0.5 + glow * 0.35;
  });
  const w = last.width * 1.06;
  const top = last.y + last.height * 0.7;
  return (
    <motion.path
      d={`M ${n(last.x - w / 2)} ${n(top)} L ${n(last.x + w / 2)} ${n(top)} L ${n(
        last.x + w * 0.2
      )} ${n(top + 58)} L ${n(last.x - w * 0.12)} ${n(top + 62)} Z`}
      fill="#14b8a6"
      stroke="#5eead4"
      strokeWidth={1.8}
      strokeLinejoin="round"
      style={{ fillOpacity, strokeOpacity }}
    />
  );
}

export default function SpineColumn({
  progress,
  className = "",
}: {
  progress: MotionValue<number>;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Slow 3D turn as the column is scanned — enough to read as dimensional,
  // never enough to make the anatomy hard to follow.
  const rotateY = useTransform(progress, [0, 1], reduced ? [0, 0] : [-13, 11]);
  const rotateZ = useTransform(progress, [0, 1], reduced ? [0, 0] : [-2.5, 2.5]);

  const scanX = useTransform(progress, (p) => positionAt(p).x);
  const scanY = useTransform(progress, (p) => positionAt(p).y);
  const cordDraw = useTransform(progress, [0, 1], [0.04, 1]);

  return (
    <motion.div
      className={className}
      style={{
        rotateY,
        rotateZ,
        transformPerspective: 1000,
      }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cord-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="55%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <radialGradient id="scan-glow">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#2dd4bf" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Spinal cord — a soft channel behind the bone, drawn in as the scan descends. */}
        <path
          d={CORD_D}
          fill="none"
          stroke="url(#cord-gradient)"
          strokeWidth={16}
          strokeLinecap="round"
          opacity={0.12}
        />
        <motion.path
          d={CORD_D}
          fill="none"
          stroke="url(#cord-gradient)"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.75}
          style={{ pathLength: cordDraw }}
        />

        {VERTEBRAE.slice(0, -1).map((v, i) => (
          <Disc key={`d-${v.index}`} a={v} b={VERTEBRAE[i + 1]} progress={progress} />
        ))}

        {VERTEBRAE.map((v) => (
          <VertebraShape key={v.index} v={v} progress={progress} />
        ))}

        {/* Sacrum — anchors the column so the shape reads as a spine
            immediately, without needing a label to say so. */}
        <SacrumShape progress={progress} />

        <motion.circle
          r={46}
          fill="url(#scan-glow)"
          style={{ cx: scanX, cy: scanY }}
        />
        <motion.circle
          r={4.5}
          fill="#5eead4"
          style={{ cx: scanX, cy: scanY }}
        />
      </svg>
    </motion.div>
  );
}
