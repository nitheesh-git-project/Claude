import type { DiagramKind } from "@/lib/angleFraming";

// Small drawings of where the camera goes. Decorative: the steps beside them
// say the same in words, so the drawing is hidden from a screen reader.

const CAMERA = (
  <g>
    <rect x="6" y="30" width="22" height="14" rx="3" fill="currentColor" opacity="0.85" />
    <circle cx="17" cy="37" r="4" fill="var(--angle-diagram-bg, #fff)" />
    <path d="M28 37 L52 28 M28 37 L52 46" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
  </g>
);

export default function AngleDiagram({ kind }: { kind: DiagramKind }) {
  return (
    <svg
      viewBox="0 0 160 76"
      role="presentation"
      aria-hidden
      focusable="false"
      className="h-20 w-40 shrink-0 text-teal-800 [--angle-diagram-bg:#f8fafc]"
    >
      <rect x="0" y="0" width="160" height="76" rx="10" fill="var(--angle-diagram-bg)" />
      {CAMERA}
      {kind === "leg_side" && (
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M84 14 L110 40 L100 66" />
          <circle cx="84" cy="12" r="3" fill="currentColor" />
          <circle cx="110" cy="40" r="3.5" fill="#f59e0b" stroke="none" />
          <path d="M60 70 H150" strokeWidth="1.5" opacity="0.4" />
        </g>
      )}
      {kind === "arm_side" && (
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M80 14 L82 40" />
          <path d="M82 40 L112 52 L130 40" />
          <circle cx="112" cy="52" r="3.5" fill="#f59e0b" stroke="none" />
        </g>
      )}
      {kind === "front_body" && (
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
          <circle cx="104" cy="14" r="6" />
          <path d="M104 22 V46 M104 46 L94 68 M104 46 L114 68 M104 28 L84 38 M104 28 L124 38" />
          <circle cx="104" cy="46" r="3.5" fill="#f59e0b" stroke="none" />
        </g>
      )}
      {kind === "along_arm" && (
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M110 40 H70" />
          <path d="M110 40 L120 12" />
          <circle cx="110" cy="40" r="3.5" fill="#f59e0b" stroke="none" />
          <path d="M110 40 V10" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}
