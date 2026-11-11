"use client";

import { motion } from "motion/react";
import type { BodyArea } from "@/lib/bodyAreas";

/**
 * Where it hurts, drawn: a plain figure with the sore area glowing.
 *
 * `state` moves it from "sore" (a rose glow that pulses quickly) to "better"
 * (teal, slow and calm), which is the whole story both bands tell: the care
 * area a visitor recognises, and the change a health profile tracks. It is a
 * drawing, not a diagnosis, so it names an area and never a structure.
 *
 * Decorative: every use sits beside words that say the same thing, so the
 * figure is aria-hidden and the caller labels nothing twice.
 */
export type { BodyArea };

// Centre of each area on the 120 x 240 figure.
const SPOTS: Record<BodyArea, { x: number; y: number; r: number }> = {
  head: { x: 60, y: 26, r: 16 },
  neck: { x: 60, y: 50, r: 10 },
  "upper-back": { x: 60, y: 72, r: 15 },
  chest: { x: 52, y: 80, r: 12 },
  "lower-back": { x: 60, y: 112, r: 14 },
  hips: { x: 60, y: 128, r: 18 },
  knee: { x: 47, y: 178, r: 10 },
  ankle: { x: 72, y: 222, r: 9 },
};

export default function BodyFocus({
  area,
  state,
  reduceMotion = false,
  className = "",
}: {
  area: BodyArea;
  state: "sore" | "better";
  reduceMotion?: boolean;
  className?: string;
}) {
  const spot = SPOTS[area];
  const sore = state === "sore";
  const colour = sore ? "#f43f5e" : "#14b8a6";

  return (
    <svg viewBox="0 0 120 240" aria-hidden="true" className={className}>
      <defs>
        <radialGradient id={`glow-${area}`}>
          <stop offset="0%" stopColor={colour} stopOpacity="0.85" />
          <stop offset="60%" stopColor={colour} stopOpacity="0.35" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The figure: soft shapes, no anatomy. */}
      <g fill="#e6f2f0" stroke="#b9d7d1" strokeWidth="1.2">
        <circle cx="60" cy="26" r="16" />
        <rect x="53" y="40" width="14" height="14" rx="5" />
        <path d="M34 58 Q60 50 86 58 L82 132 Q60 138 38 132 Z" />
        <path d="M34 60 L22 118 Q20 124 26 125 L32 122 L42 70 Z" />
        <path d="M86 60 L98 118 Q100 124 94 125 L88 122 L78 70 Z" />
        <path d="M40 130 L36 226 Q36 232 44 232 L52 232 L58 136 Z" />
        <path d="M80 130 L84 226 Q84 232 76 232 L68 232 L62 136 Z" />
      </g>

      {/* The sore area. Pulses fast while sore, slow once better. */}
      <motion.circle
        cx={spot.x}
        cy={spot.y}
        fill={`url(#glow-${area})`}
        initial={false}
        animate={
          reduceMotion
            ? { r: spot.r * 1.6, opacity: 0.9 }
            : sore
              ? { r: [spot.r * 1.3, spot.r * 2.1, spot.r * 1.3], opacity: [0.95, 0.6, 0.95] }
              : { r: [spot.r * 1.5, spot.r * 1.8, spot.r * 1.5], opacity: [0.75, 0.55, 0.75] }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: sore ? 1.1 : 3.2, repeat: Infinity, ease: "easeInOut" }
        }
      />
      <motion.circle
        cx={spot.x}
        cy={spot.y}
        r={spot.r * 0.45}
        initial={false}
        animate={{ fill: colour }}
        transition={{ duration: reduceMotion ? 0 : 0.8 }}
      />
    </svg>
  );
}
