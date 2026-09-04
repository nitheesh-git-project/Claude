"use client";

/**
 * The one spinner in this app.
 *
 * There were none before: every busy state was a text swap ("Save" ->
 * "Saving..."), which reads as a label change rather than as motion and is
 * invisible on a button whose text was already long. It inherits
 * `currentColor` so a single component works on the teal filled buttons, the
 * white outlined ones and the plain text links without a variant each.
 *
 * `aria-hidden`: it sits inside a control whose own text says what is
 * happening ("Saving…"), and a second announcement of the same fact is noise.
 */
export default function Spinner({
  className = "",
  size = 14,
}: {
  className?: string;
  /** Pixels. Defaults to a hair under the 16px text it usually sits beside. */
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`spinner shrink-0 ${className}`}
    >
      {/* The track, so the moving arc reads as a ring rather than a comma. */}
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
