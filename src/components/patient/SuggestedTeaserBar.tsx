import Link from "next/link";
import type { SuggestedTeaser } from "@/lib/suggestedTeaser";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * The short "your therapist recommended..." line at the top of every
 * patient screen but Suggested Sessions, the whole of it a link there. A
 * recommendation is the one thing a patient can be waiting to answer that
 * lapses, and it used to live on two screens out of nine.
 */
export default function SuggestedTeaserBar({ teaser }: { teaser: SuggestedTeaser }) {
  return (
    <Link
      href="/patient/dashboard/suggested"
      data-testid="suggested-teaser"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-3 pr-4 transition hover:border-teal-400 hover:bg-teal-50"
    >
      {teaser.kind === "plan" && teaser.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={teaser.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
          <i
            className={`fa-solid ${teaser.kind === "plan" ? "fa-lightbulb" : "fa-calendar-plus"}`}
            aria-hidden="true"
          />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-teal-700">
          Suggested for you
        </span>
        <span className="block truncate text-sm font-semibold text-slate-800">
          {teaser.kind === "plan"
            ? `${teaser.title} - ${teaser.sessionCount} ${
                teaser.isHomeVisit
                  ? teaser.sessionCount === 1 ? "home visit" : "home visits"
                  : teaser.sessionCount === 1 ? "session" : "sessions"
              } · ${formatInr(teaser.pricePaise)}`
            : `Your therapist proposed ${teaser.count} ${teaser.count === 1 ? "time" : "times"} for your sessions`}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-teal-700">
        View <i className="fa-solid fa-arrow-right ml-0.5 text-[10px]" aria-hidden="true" />
      </span>
    </Link>
  );
}
