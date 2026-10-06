/**
 * The app's loading mark: a spine settling into line.
 *
 * Seven vertebrae, largest at the bottom like a real lumbar spine, start
 * slightly out of line and settle straight one by one from the neck down,
 * hold, and drift again. It says "physiotherapy" without a word and it is
 * calm -- the opposite of a spinner -- which matters on a screen people open
 * while they are in pain.
 *
 * Purely presentational and server-safe: the motion is CSS (`spine-*` in
 * globals.css), so it runs before any JavaScript, and `prefers-reduced-motion`
 * shows the aligned spine still rather than nothing.
 */

// Out-of-line offsets, in px, forming a gentle S-curve rather than noise --
// what a posture that is about to be corrected looks like.
const VERTEBRAE = [
  { width: 22, offset: -3 },
  { width: 24, offset: -6 },
  { width: 26, offset: -7 },
  { width: 28, offset: -3 },
  { width: 30, offset: 3 },
  { width: 32, offset: 6 },
  { width: 34, offset: 4 },
];

export default function SpineLoader({
  label = "Getting things ready…",
  size = "md",
  className = "",
}: {
  /** Read aloud and shown under the mark. Pass "" to show the mark alone. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const scale = size === "sm" ? 0.6 : 1;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 ${className}`}
    >
      <div
        aria-hidden="true"
        className="spine-loader relative flex flex-col items-center"
        style={{ gap: 5 * scale, paddingBlock: 6 * scale }}
      >
        {/* The cord the vertebrae settle onto: the line "straight" means. */}
        <span className="spine-loader__cord absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-teal-100" />
        {VERTEBRAE.map((v, i) => (
          <span
            key={i}
            className="spine-loader__vertebra relative block rounded-full bg-teal-700"
            style={
              {
                width: v.width * scale,
                height: 9 * scale,
                "--spine-offset": `${v.offset * scale}px`,
                "--spine-i": i,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      {label ? (
        <p className="text-sm font-semibold text-slate-600">{label}</p>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  );
}
