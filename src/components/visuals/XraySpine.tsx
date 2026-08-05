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
      <BoneGroup v={v} fill={`url(#${gradientId})`} stroke="#f4f8ff" strokeWidth={1.3} />
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

  const rotateY = useTransform(progress, [0, 1], reduced ? [0, 0] : [-19, 15]);
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
            <stop offset="0%" stopColor="#f2f6ff" stopOpacity="0.98" />
            <stop offset="38%" stopColor="#b9c8ee" stopOpacity="0.72" />
            <stop offset="72%" stopColor="#8fa3d8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#eef3ff" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={id("boneDim")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b9bc9" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#46557f" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#8d9dcb" stopOpacity="0.6" />
          </linearGradient>

          <radialGradient id={id("plate")} cx="0.5" cy="0.42" r="0.8">
            <stop offset="0%" stopColor="#05070d" />
            <stop offset="65%" stopColor="#020409" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>

          <linearGradient id={id("sweep")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a9beff" stopOpacity="0" />
            <stop offset="50%" stopColor="#dbe6ff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#a9beff" stopOpacity="0" />
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
        <g filter={`url(#${id("bloom")})`} opacity={0.55}>
          {VERTEBRAE.map((v) => (
            <BoneGroup key={`bloom-${v.index}`} v={v} fill="#7f97e0" stroke="#7f97e0" strokeWidth={2.4} />
          ))}
          <>
            <path d={SACRUM.path} fill="#7f97e0" stroke="#7f97e0" strokeWidth={2.4} />
            <path d={SACRUM.coccyx} fill="#7f97e0" stroke="#7f97e0" strokeWidth={2.4} />
          </>
        </g>

        {/* Unexposed baseline */}
        <g>
          {VERTEBRAE.map((v) => (
            <BoneGroup
              key={`base-${v.index}`}
              v={v}
              fill={`url(#${id("boneDim")})`}
              stroke="#94a6d6"
              strokeWidth={1}
            />
          ))}
          <path
            d={SACRUM.path}
            fill={`url(#${id("boneDim")})`}
            stroke="#94a6d6"
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <path
            d={SACRUM.coccyx}
            fill={`url(#${id("boneDim")})`}
            stroke="#94a6d6"
            strokeWidth={1}
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
            ry={Math.min(3.2, Math.max(1.2, d.ry))}
            fill="#000000"
            opacity={0.6}
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
          <rect x={6} y={-0.6} width={VIEWBOX.width - 12} height={1.2} fill="#dee8ff" opacity={0.85} />
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
