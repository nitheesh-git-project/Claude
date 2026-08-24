/**
 * A single fact, stated in a title and at most one line.
 *
 * Replaces the three-sentence card that the old pages used everywhere. The
 * word budget is the point: six of these read in the time one old card took,
 * which is what turns a wall of text into something a visitor can scan.
 */
export default function IconCard({
  icon,
  title,
  body,
  tone = "teal",
}: {
  icon: string;
  title: string;
  body: string;
  tone?: "teal" | "rose" | "slate";
}) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  } as const;

  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-teal-200 sm:p-6">
      <span
        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </span>
      <h3 className="font-display text-[15px] font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
