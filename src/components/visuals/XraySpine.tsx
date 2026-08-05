"use client";

import { useId } from "react";
import {
  motion,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { VERTEBRAE, DISCS, SACRUM, VIEWBOX, type Vertebra } from "./spineGeometry";

/**
 * Radiograph-style spinal column driven by a 0..1 scroll MotionValue.
 *
 * Rendering follows how an actual X-ray reads: dense cortical bone burns
 * brightest at the edges, cancellous bone sits mid-grey, and the discs are
 * radiolucent gaps. A scan descends the column as `progress` advances —
 * bone behind the scan stays "exposed", the band under it flares.
 *
 * Filters (bloom, film grain, vignette) are applied once to static layers.
 * Only per-vertebra opacity and the scan marker follow the scroll value, so
 * nothing re-runs a filter per frame.
 */

/** Emission profile of the scan as it passes a given vertebra. */
function scanResponse(t: number, p: number) {
  const glow = Math.max(0, 1 - Math.abs(t - p) * 4.6);
  const exposed = Math.min(1, Math.max(0, (p - t) * 12));
  return { glow, exposed };
}

function BoneGroup({
  v,
  fill,
  stroke,
  strokeWidth,
}: {
  v: Vertebra;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  return (
    <g transform={`translate(${v.x} ${v.y}) rotate(${v.rotation})`}>
      {v.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

function ExposedVertebra({
  v,
  progress,
  gradientId,
}: {
  v: Vertebra;
  progress: MotionValue<number>;
  gradientId: string;
}) {
  const opacity = useTransform(progress, (p) => {
    const { glow, exposed } = scanResponse(v.t, p);
    return Math.min(1, exposed * 0.5 + glow * 0.95);
  });

  return (
    <motion.g style={{ opacity }}>
      <BoneGroup v={v} fill={`url(#${gradientId})`} stroke="#eaf7ff" strokeWidth={1.15} />
    </motion.g>
  );
}

export default function XraySpine({
  progress,
  className = "",
  variant = "plate",
}: {
  progress: MotionValue<number>;
  className?: string;
  /**
   * "plate" renders the full radiograph including the film plate, grain
   * and vignette. "bare" drops all of that and draws bone only, for use
   * as a decorative watermark over an existing background.
   */
  variant?: "plate" | "bare";
}) {
  const bare = variant === "bare";
  const reduced = useReducedMotion();
  // Scoped so multiple instances on one page can't collide on filter ids.
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;

  const rotateY = useTransform(progress, [0, 1], reduced ? [0, 0] : [-9, 7]);
  const scanY = useTransform(progress, [0, 1], [VIEWBOX.height * 0.05, VIEWBOX.height * 0.9]);
  const scanOpacity = useTransform(progress, [0, 0.04, 0.96, 1], [0, 1, 1, 0]);

  return (
    <motion.div
      className={className}
      style={{ rotateY, transformPerspective: 1400 }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        className="h-full w-full"
        {...(bare
          ? { "aria-hidden": true as const }
          : {
              role: "img",
              "aria-label":
                "Lateral X-ray illustration of the spinal column, scanned from the neck down to the lower back.",
            })}
      >
        <defs>
          {/* Cancellous interior reads dimmer than the cortical shell. */}
          <linearGradient id={id("bone")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#dcf1fb" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#9dc9e0" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#e8f7ff" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id={id("boneDim")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6d9fbb" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#4b7891" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#7cb0cc" stopOpacity="0.48" />
          </linearGradient>

          <radialGradient id={id("plate")} cx="0.5" cy="0.42" r="0.75">
            <stop offset="0%" stopColor="#132433" />
            <stop offset="70%" stopColor="#0a1420" />
            <stop offset="100%" stopColor="#050b12" />
          </radialGradient>

          <linearGradient id={id("sweep")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7fdcff" stopOpacity="0" />
            <stop offset="50%" stopColor="#bdefff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7fdcff" stopOpacity="0" />
          </linearGradient>

          <filter id={id("bloom")} x="-30%" y="-12%" width="160%" height="124%">
            <feGaussianBlur stdDeviation="6" />
          </filter>

          {/* Film grain — static, so it costs one rasterisation. */}
          <filter id={id("grain")} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>

          <radialGradient id={id("vignette")} cx="0.5" cy="0.5" r="0.72">
            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.75" />
          </radialGradient>
        </defs>

        {/* Imaging plate */}
        {!bare && (
          <rect width={VIEWBOX.width} height={VIEWBOX.height} fill={`url(#${id("plate")})`} rx={18} />
        )}

        {/* Soft halo around the whole column, drawn once. */}
        <g filter={`url(#${id("bloom")})`} opacity={0.42}>
          {VERTEBRAE.map((v) => (
            <BoneGroup key={`bloom-${v.index}`} v={v} fill="#4aa8cc" stroke="#4aa8cc" strokeWidth={2} />
          ))}
          <path d={SACRUM.path} fill="#4aa8cc" stroke="#4aa8cc" strokeWidth={2} />
        </g>

        {/* Unexposed baseline */}
        <g>
          {VERTEBRAE.map((v) => (
            <BoneGroup
              key={`base-${v.index}`}
              v={v}
              fill={`url(#${id("boneDim")})`}
              stroke="#8fc3dd"
              strokeWidth={0.9}
            />
          ))}
          <path
            d={SACRUM.path}
            fill={`url(#${id("boneDim")})`}
            stroke="#8fc3dd"
            strokeWidth={0.9}
            strokeLinejoin="round"
          />
        </g>

        {/* Discs read as radiolucent gaps between the bodies. */}
        {DISCS.map((d) => (
          <ellipse
            key={`disc-${d.key}`}
            cx={d.cx}
            cy={d.cy}
            rx={d.rx}
            ry={Math.max(1.4, d.ry)}
            fill="#040a12"
            opacity={0.55}
          />
        ))}

        {/* Exposure that follows the scan */}
        {VERTEBRAE.map((v) => (
          <ExposedVertebra
            key={`hot-${v.index}`}
            v={v}
            progress={progress}
            gradientId={id("bone")}
          />
        ))}

        {/* Scan marker */}
        {!bare && (
        <motion.g style={{ y: scanY, opacity: scanOpacity }}>
          <rect
            x={6}
            y={-34}
            width={VIEWBOX.width - 12}
            height={68}
            fill={`url(#${id("sweep")})`}
            opacity={0.24}
          />
          <rect x={6} y={-0.6} width={VIEWBOX.width - 12} height={1.2} fill="#cdf2ff" opacity={0.85} />
        </motion.g>
        )}

        {/* Grain + vignette finish the radiograph look. */}
        {!bare && (
        <>
        <rect
          width={VIEWBOX.width}
          height={VIEWBOX.height}
          filter={`url(#${id("grain")})`}
          opacity={0.05}
          rx={18}
          style={{ mixBlendMode: "overlay" }}
        />
        <rect
          width={VIEWBOX.width}
          height={VIEWBOX.height}
          fill={`url(#${id("vignette")})`}
          rx={18}
        />
        </>
        )}
      </svg>
    </motion.div>
  );
}
