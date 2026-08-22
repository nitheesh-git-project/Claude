"use client";

// A row of "show me only this" chips above a list. One component so every
// list's filter looks and behaves the same, whichever dashboard it is on --
// the same reason ListPager exists underneath them.
//
// Counts are part of the label rather than a separate badge: "Needs you 3"
// answers "is it worth switching to this?" before the switch, which is the
// whole point of showing a filter you have not selected.
export type FilterChoice<T extends string> = {
  key: T;
  label: string;
  count?: number;
};

export default function FilterChips<T extends string>({
  value,
  onChange,
  choices,
  label,
  className = "",
}: {
  value: T;
  onChange: (next: T) => void;
  choices: FilterChoice<T>[];
  /** Screen-reader name for the group, e.g. "Filter referrals". */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ${className}`}
    >
      {choices.map((choice) => (
        <button
          key={choice.key}
          type="button"
          onClick={() => onChange(choice.key)}
          aria-pressed={value === choice.key}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            value === choice.key
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {choice.label}
          {choice.count !== undefined && (
            <span className={value === choice.key ? "ml-1.5 text-slate-400" : "ml-1.5 text-slate-400"}>
              {choice.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
