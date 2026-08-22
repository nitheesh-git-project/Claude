"use client";

import { useCallback, useMemo, useState } from "react";

// Every list in this app pages through the same control, from one hook, so
// "how do I see the rest?" has one answer everywhere. Before this, a long
// list either painted every row (thousands of table rows an admin never
// scrolled to, downloaded on every render) or capped itself at an
// arbitrary number with a "Show all" escape hatch that then painted them
// all anyway.
//
// Paging is client-side on rows the screen already has: these lists are
// filtered in the browser and the export buttons read the same filtered
// array, so fetching per page would make the download disagree with the
// list. When a table grows past what a page can hold at all, that is a
// server-pagination decision, not this hook's job.

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 500;

export type Pager = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** 1-based index of the first row on this page; 0 when there are none. */
  from: number;
  /** 1-based index of the last row on this page; 0 when there are none. */
  to: number;
  canPrevious: boolean;
  canNext: boolean;
  setPageSize: (size: number) => void;
  previous: () => void;
  next: () => void;
};

export function usePagedList<T>(
  rows: T[],
  {
    storageKey,
    defaultPageSize = DEFAULT_PAGE_SIZE,
  }: {
    /** Remembers this list's page size per browser. Each list gets its own
     *  key: an admin who wants 100 payouts on screen does not necessarily
     *  want 100 FAQ entries. */
    storageKey?: string;
    defaultPageSize?: number;
  } = {}
): { rows: T[]; pager: Pager } {
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [page, setPage] = useState(0);

  // The remembered size is restored during the first *client* render, not
  // in a useState initialiser (which also runs on the server, where there
  // is no window, and would hydrate against different HTML) and not in an
  // effect (which sets state after paint, flashing the default page size
  // first). Same shape as AdminAllSessionsTab's saved filters.
  const [restored, setRestored] = useState(false);
  if (!restored && typeof window !== "undefined") {
    if (storageKey) {
      try {
        const stored = Number(window.localStorage.getItem(`pager:${storageKey}`));
        if (Number.isFinite(stored) && stored >= 1) {
          setPageSizeState(Math.min(MAX_PAGE_SIZE, Math.floor(stored)));
        }
      } catch {
        // Private mode, or storage disabled. The default is fine.
      }
    }
    setRestored(true);
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  // Clamped rather than corrected in an effect: filters shrink the list
  // under the current page all the time, and an effect would render one
  // empty frame before fixing it.
  const safePage = Math.min(page, pageCount - 1);

  const setPageSize = useCallback(
    (size: number) => {
      const next = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(size) || 1));
      setPageSizeState(next);
      // Back to the top: keeping the page index while the size changes
      // scrolls the reader somewhere they did not ask to be.
      setPage(0);
      if (!storageKey) return;
      try {
        window.localStorage.setItem(`pager:${storageKey}`, String(next));
      } catch {
        // Not being able to remember the preference is not worth an error.
      }
    },
    [storageKey]
  );

  const pageRows = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize]
  );

  const pager: Pager = {
    page: safePage,
    pageCount,
    pageSize,
    total,
    from: total === 0 ? 0 : safePage * pageSize + 1,
    to: Math.min(total, safePage * pageSize + pageSize),
    canPrevious: safePage > 0,
    canNext: safePage < pageCount - 1,
    setPageSize,
    previous: () => setPage((p) => Math.max(0, Math.min(p, pageCount - 1) - 1)),
    next: () => setPage((p) => Math.min(pageCount - 1, p + 1)),
  };

  return { rows: pageRows, pager };
}
