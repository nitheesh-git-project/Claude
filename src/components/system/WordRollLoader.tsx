/**
 * The app's loading mark: the five steps of recovery rolling past.
 *
 * Move, Stretch, Strengthen, Recover, Restore scroll up one at a time; the
 * one in the middle is dark, the rest fade into the page, and three teal
 * dots hop in front of whichever word is current. It says what this place
 * is for -- the brand's own promise, in order -- and it is calm: one word a
 * beat, no spinning.
 *
 * Pure CSS (`word-roll*` in globals.css) and server-safe, so it is already
 * moving before any JavaScript runs. The list is the five words three times
 * over, and the track scrolls exactly one set per cycle, so the end of the
 * loop is pixel-identical to its start. `prefers-reduced-motion` gets the
 * list standing still on "Move", dots resting.
 */

export const LOADER_WORDS = ["Move", "Stretch", "Strengthen", "Recover", "Restore"] as const;

export default function WordRollLoader({
  label = "Loading…",
  size = "md",
  className = "",
}: {
  /** Read to a screen reader; nothing is printed. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const rows = [...LOADER_WORDS, ...LOADER_WORDS, ...LOADER_WORDS];
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center ${className}`}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={`word-roll word-roll--${size}`}>
        <span className="word-roll__dots">
          <span />
          <span />
          <span />
        </span>
        <div className="word-roll__track">
          {rows.map((word, i) => (
            <span
              key={i}
              className="word-roll__row"
              style={{ "--word-i": i % LOADER_WORDS.length } as React.CSSProperties}
            >
              {word}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
