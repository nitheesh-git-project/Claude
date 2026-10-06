import { ratingWord, splitFeedback } from "@/lib/feedbackPicks";

// Read-only pieces of a session rating, shared by the rating card's
// summary, the admin session drawer and the All Sessions table, so the
// three cannot draw the same rating three ways.

const STAR_PATH = "M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L2.9 9.4l6.3-.9z";

export function StarIcon({
  filled,
  size = 18,
  className = "",
}: {
  filled: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d={STAR_PATH}
        fill={filled ? "#f59e0b" : "#ffffff"}
        stroke={filled ? "#d97706" : "#cbd5e1"}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Five stars, the first `rating` filled. Named for a screen reader. */
export function StarRow({ rating, size = 18 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} size={size} />
      ))}
    </span>
  );
}

/**
 * A rating in a table cell: "★ 4.0", coloured by how good it was, with a
 * speech-bubble mark when there is written feedback behind it. An excluded
 * rating is struck through -- it still happened, it just does not count.
 */
export function RatingChip({
  rating,
  feedback,
  excluded = false,
}: {
  rating: number | null;
  feedback?: string | null;
  excluded?: boolean;
}) {
  if (!rating) return <span className="text-xs text-slate-400">Not rated</span>;
  const tone = excluded
    ? "bg-slate-100 text-slate-500 line-through"
    : rating >= 4
      ? "bg-amber-50 text-amber-800"
      : rating === 3
        ? "bg-slate-100 text-slate-700"
        : "bg-orange-50 text-orange-800";
  const hasNote = !!feedback?.trim();
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}
      title={hasNote ? feedback ?? undefined : excluded ? "Excluded from the average" : undefined}
    >
      <span aria-hidden="true">★</span>
      <span>
        {rating.toFixed(1)}
        <span className="sr-only"> out of 5{excluded ? ", excluded from the average" : ""}</span>
      </span>
      {hasNote && (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Has written feedback"
        >
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
      )}
    </span>
  );
}

/** The picks as chips and the rest as a quote, from the saved feedback. */
export function FeedbackBody({
  feedback,
  tone = "teal",
}: {
  feedback: string | null | undefined;
  tone?: "teal" | "amber";
}) {
  const { picks, note } = splitFeedback(feedback);
  if (picks.length === 0 && !note) return null;
  const chip =
    tone === "amber"
      ? "border-amber-200 bg-white text-amber-900"
      : "border-teal-100 bg-teal-50 text-teal-900";
  return (
    <div className="space-y-2">
      {picks.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Quick picks">
          {picks.map((p) => (
            <li key={p} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${chip}`}>
              {p}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
          &ldquo;{note}&rdquo;
        </p>
      )}
    </div>
  );
}

export { ratingWord };
