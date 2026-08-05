"use client";

/**
 * Authored vector medical illustrations, shared by the care-areas grid,
 * the programs section and the booking journey.
 *
 * These are deliberately illustrative rather than photographic. Stock
 * photography of models posing as patients tends to *reduce* trust on a
 * clinical site, and it can't be verified. Each illustration is a single
 * inline SVG — no network request, no layout shift, and it inherits
 * currentColor so one component covers light and dark placements.
 *
 * To swap in real photography later, render <CareIllustration> and a
 * next/image side by side in the same aspect-ratio wrapper; nothing else
 * in the consuming layouts needs to change.
 */

export type CareIllustrationId =
  | "parkinsons"
  | "ergonomics"
  | "posture"
  | "neckback"
  | "sports"
  | "mobility"
  | "preventive"
  | "booking"
  | "assessment"
  | "plan";

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 120 96" className="h-full w-full" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Shared body-outline used by several of the scenes for visual consistency. */
function Figure({
  x = 60,
  scale = 1,
  lean = 0,
}: {
  x?: number;
  scale?: number;
  lean?: number;
}) {
  return (
    <g transform={`translate(${x} 0) rotate(${lean} 0 78) scale(${scale})`} strokeLinecap="round">
      <circle cx={0} cy={26} r={7} strokeWidth={2.4} fill="none" />
      <path d="M0 33 L0 58" strokeWidth={2.4} fill="none" />
      <path d="M0 40 L-11 50 M0 40 L11 50" strokeWidth={2.4} fill="none" />
      <path d="M0 58 L-8 78 M0 58 L8 78" strokeWidth={2.4} fill="none" />
    </g>
  );
}

export default function CareIllustration({
  id,
  className = "",
}: {
  id: CareIllustrationId;
  className?: string;
}) {
  const common = `text-teal-600 ${className}`;

  switch (id) {
    case "parkinsons":
      // Gait-and-balance training: a figure mid-stride with a stability arc
      // and rhythm cues, which is what cueing-based rehab actually looks like.
      return (
        <div className={common}>
          <Frame label="Gait and balance rehabilitation illustration">
            <path d="M14 84 H106" strokeWidth={2} className="opacity-30" fill="none" stroke="currentColor" />
            {[26, 44, 62, 80, 96].map((cx, i) => (
              <circle key={cx} cx={cx} cy={84} r={2.4} fill="currentColor" className={i === 2 ? "opacity-90" : "opacity-35"} />
            ))}
            <g stroke="currentColor">
              <Figure x={58} lean={-4} />
            </g>
            <path
              d="M34 70 Q58 44 84 70"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
              className="opacity-50"
            />
          </Frame>
        </div>
      );

    case "ergonomics":
      // Desk, monitor and seated figure with an alignment guide.
      return (
        <div className={common}>
          <Frame label="Workplace ergonomics illustration">
            <rect x={16} y={70} width={88} height={3} rx={1.5} fill="currentColor" className="opacity-70" />
            <rect x={60} y={30} width={40} height={26} rx={3} stroke="currentColor" strokeWidth={2.2} fill="none" />
            <path d="M80 56 V70" stroke="currentColor" strokeWidth={2.2} />
            <g stroke="currentColor">
              <circle cx={34} cy={34} r={6.5} strokeWidth={2.4} fill="none" />
              <path d="M34 41 L34 58" strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <path d="M34 46 L47 52" strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <path d="M34 58 L46 58 M34 58 L28 70" strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <path d="M46 58 L46 70" strokeWidth={2.4} fill="none" strokeLinecap="round" />
            </g>
            <path d="M34 20 V64" stroke="currentColor" strokeWidth={1.4} strokeDasharray="3 4" className="opacity-45" />
          </Frame>
        </div>
      );

    case "posture":
      // Plumb-line posture screen with deviation markers.
      return (
        <div className={common}>
          <Frame label="Daily posture assessment illustration">
            <path d="M60 12 V88" stroke="currentColor" strokeWidth={1.4} strokeDasharray="3 4" className="opacity-45" />
            <g stroke="currentColor">
              <Figure x={64} lean={6} />
            </g>
            {[
              [64, 26],
              [62, 44],
              [60, 60],
            ].map(([cx, cy]) => (
              <circle key={cy} cx={cx} cy={cy} r={3.2} fill="currentColor" className="opacity-80" />
            ))}
            <path d="M74 22 h14" stroke="currentColor" strokeWidth={1.6} className="opacity-60" />
            <path d="M74 44 h14" stroke="currentColor" strokeWidth={1.6} className="opacity-60" />
          </Frame>
        </div>
      );

    case "neckback":
      // Cervical + lumbar hotspots on a simplified column.
      return (
        <div className={common}>
          <Frame label="Neck and back pain illustration">
            <path
              d="M60 16 Q52 34 58 48 Q64 62 56 84"
              stroke="currentColor"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              className="opacity-70"
            />
            {[22, 30, 38, 46, 54, 62, 70, 78].map((y, i) => (
              <rect
                key={y}
                x={i < 4 ? 52 + i : 50 + i * 0.4}
                y={y}
                width={14}
                height={5}
                rx={2}
                fill="currentColor"
                className="opacity-45"
              />
            ))}
            <circle cx={57} cy={26} r={11} fill="currentColor" className="opacity-15" />
            <circle cx={58} cy={72} r={13} fill="currentColor" className="opacity-20" />
          </Frame>
        </div>
      );

    case "sports":
      // Return-to-sport: running figure with a load-progression arc.
      return (
        <div className={common}>
          <Frame label="Sports rehabilitation illustration">
            <g stroke="currentColor" strokeLinecap="round" fill="none">
              <circle cx={44} cy={26} r={7} strokeWidth={2.4} />
              <path d="M46 33 L54 52" strokeWidth={2.4} />
              <path d="M46 40 L32 42 M46 40 L62 34" strokeWidth={2.4} />
              <path d="M54 52 L44 72 M54 52 L70 62 L66 80" strokeWidth={2.4} />
            </g>
            <path d="M14 84 H106" stroke="currentColor" strokeWidth={2} className="opacity-30" />
            <path
              d="M20 74 Q50 20 100 30"
              stroke="currentColor"
              strokeWidth={2}
              fill="none"
              strokeDasharray="5 4"
              className="opacity-45"
            />
          </Frame>
        </div>
      );

    case "mobility":
      // Range-of-motion arc opening around a joint.
      return (
        <div className={common}>
          <Frame label="Mobility improvement illustration">
            <circle cx={44} cy={62} r={4.5} fill="currentColor" />
            <path d="M44 62 L44 22" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M44 62 L92 62" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" className="opacity-45" />
            <path
              d="M44 34 A28 28 0 0 1 72 62"
              stroke="currentColor"
              strokeWidth={2.2}
              fill="none"
              strokeDasharray="4 4"
            />
            <path d="M62 40 l6 -6 l1 9 z" fill="currentColor" className="opacity-80" />
            <path d="M20 84 H100" stroke="currentColor" strokeWidth={2} className="opacity-25" />
          </Frame>
        </div>
      );

    case "preventive":
      // Shield + upward trend: staying ahead of injury.
      return (
        <div className={common}>
          <Frame label="Preventive physiotherapy illustration">
            <path
              d="M60 16 L88 26 V52 Q88 74 60 84 Q32 74 32 52 V26 Z"
              stroke="currentColor"
              strokeWidth={2.4}
              fill="none"
            />
            <path d="M44 56 L55 66 L78 40" stroke="currentColor" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M60 16 L88 26 V52 Q88 74 60 84 Z" fill="currentColor" className="opacity-10" />
          </Frame>
        </div>
      );

    case "booking":
      // Calendar with a confirmed slot.
      return (
        <div className={common}>
          <Frame label="Booking a session illustration">
            <rect x={26} y={22} width={68} height={60} rx={6} stroke="currentColor" strokeWidth={2.4} fill="none" />
            <path d="M26 38 H94" stroke="currentColor" strokeWidth={2.4} />
            <path d="M42 16 V28 M78 16 V28" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect
                key={i}
                x={34 + (i % 3) * 20}
                y={46 + Math.floor(i / 3) * 16}
                width={14}
                height={9}
                rx={2}
                fill="currentColor"
                className={i === 4 ? "opacity-90" : "opacity-25"}
              />
            ))}
          </Frame>
        </div>
      );

    case "assessment":
      // Clinician review: findings sheet with measured values.
      return (
        <div className={common}>
          <Frame label="Clinical assessment illustration">
            <rect x={28} y={16} width={64} height={70} rx={6} stroke="currentColor" strokeWidth={2.4} fill="none" />
            <path d="M40 34 H80 M40 46 H72 M40 58 H76" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="opacity-45" />
            <circle cx={78} cy={68} r={13} fill="currentColor" className="opacity-12" />
            <path d="M70 68 L76 74 L88 60" stroke="currentColor" strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Frame>
        </div>
      );

    case "plan":
      // Progression: rising bars with a target marker.
      return (
        <div className={common}>
          <Frame label="Home exercise plan illustration">
            <path d="M22 84 H100" stroke="currentColor" strokeWidth={2} className="opacity-30" />
            {[
              [34, 62],
              [52, 48],
              [70, 34],
              [88, 22],
            ].map(([x, y], i) => (
              <rect
                key={x}
                x={x}
                y={y}
                width={12}
                height={84 - y}
                rx={3}
                fill="currentColor"
                className={i === 3 ? "opacity-85" : "opacity-30"}
              />
            ))}
            <path d="M34 60 L94 22" stroke="currentColor" strokeWidth={2.2} strokeDasharray="4 4" className="opacity-55" fill="none" />
          </Frame>
        </div>
      );
  }
}
