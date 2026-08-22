"use client";

import { useState } from "react";
import { PAGE_SIZE_OPTIONS, type Pager } from "@/lib/usePagedList";

// The one paging control, used under every list in the app: how many rows
// to show, which page you are on, and a step either side. Both step
// buttons grey out when there is nothing in that direction -- including on
// an empty list, where neither does anything.
export default function ListPager({
  pager,
  /** What the rows are, for the count line: "1-10 of 42 sessions". */
  noun = "row",
  nounPlural,
  className = "",
}: {
  pager: Pager;
  noun?: string;
  nounPlural?: string;
  className?: string;
}) {
  const { page, pageCount, pageSize, total, from, to, canPrevious, canNext } = pager;
  const plural = nounPlural ?? `${noun}s`;

  // The field is free typing, so it holds its own draft: forcing the value
  // back to the committed number on every keystroke makes it impossible to
  // clear the box and type a two-digit number. The draft follows pageSize
  // when that changes from elsewhere (a size restored from storage, or a
  // second pager on the same list) by comparing against the last size this
  // component saw -- adjusting state during render rather than in an
  // effect, so there is no frame showing the stale number.
  const [draft, setDraft] = useState(String(pageSize));
  const [lastSize, setLastSize] = useState(pageSize);
  if (lastSize !== pageSize) {
    setLastSize(pageSize);
    setDraft(String(pageSize));
  }

  function commit(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setDraft(String(pageSize));
      return;
    }
    pager.setPageSize(parsed);
  }

  const stepClass =
    "flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:border-slate-100 disabled:hover:text-slate-300";

  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 ${className}`}
    >
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        Show
        <input
          type="number"
          min={1}
          inputMode="numeric"
          list="list-pager-sizes"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit((event.target as HTMLInputElement).value);
            }
          }}
          aria-label={`How many ${plural} to show per page`}
          className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-400 focus:outline-none"
        />
        <span className="hidden font-normal text-slate-400 sm:inline">per page</span>
        {/* Datalist rather than a select: the field takes any number, and
            these are the sizes people actually pick. */}
        <datalist id="list-pager-sizes">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size} />
          ))}
        </datalist>
      </label>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">
          {total === 0 ? `No ${plural}` : `${from}-${to} of ${total} ${total === 1 ? noun : plural}`}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={pager.previous}
            disabled={!canPrevious}
            className={stepClass}
            aria-label={`Previous page of ${plural}`}
          >
            <i aria-hidden className="fa-solid fa-chevron-left text-[10px]" />
            Previous
          </button>
          <span className="px-1 text-xs font-semibold text-slate-500">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={pager.next}
            disabled={!canNext}
            className={stepClass}
            aria-label={`Next page of ${plural}`}
          >
            Next
            <i aria-hidden className="fa-solid fa-chevron-right text-[10px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
