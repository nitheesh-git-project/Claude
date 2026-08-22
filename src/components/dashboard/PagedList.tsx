"use client";

import { useMemo, useState, type ReactNode } from "react";
import FilterChips from "@/components/dashboard/FilterChips";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";

// Filtering and paging for a list a Server Component already rendered.
//
// Most lists in the dashboards are built server-side, and a function prop
// can't cross that boundary -- but a rendered element can. So the server
// hands over finished items keyed by id (same trick SessionCalendarTab
// uses for its day panel), tags each with the group it belongs to, and
// this decides which of them are on screen without knowing what any of
// them look like.
export type PagedListItem = {
  id: string;
  node: ReactNode;
  /** Which filter chip this row belongs to. Omit to skip filtering. */
  group?: string;
};

export default function PagedList({
  items,
  noun = "item",
  nounPlural,
  storageKey,
  defaultPageSize,
  className = "",
  emptyMessage,
  ordered = false,
  filters,
  filterLabel,
  allLabel = "All",
}: {
  items: PagedListItem[];
  noun?: string;
  nounPlural?: string;
  storageKey?: string;
  defaultPageSize?: number;
  /** Classes for the list element itself, so a caller keeps its spacing. */
  className?: string;
  emptyMessage?: string;
  /** Renders an <ol> instead of a <ul>, for a list whose order is part of
   *  what it means (a run of session notes, newest first). */
  ordered?: boolean;
  /** Chips shown above the list, in this order. Counts are worked out from
   *  the items themselves, so a caller never has to keep them in step. */
  filters?: { key: string; label: string }[];
  filterLabel?: string;
  allLabel?: string;
}) {
  const [group, setGroup] = useState("all");

  const visible = useMemo(
    () => (group === "all" ? items : items.filter((item) => item.group === group)),
    [items, group]
  );
  const { rows, pager } = usePagedList(visible, { storageKey, defaultPageSize });

  // A filter nobody can act on is noise: chips only appear when more than
  // one of them would actually have rows behind it.
  const choices = useMemo(() => {
    if (!filters || filters.length === 0) return null;
    const withCounts = filters.map((f) => ({
      ...f,
      count: items.filter((item) => item.group === f.key).length,
    }));
    if (withCounts.filter((f) => f.count > 0).length < 2) return null;
    return [{ key: "all", label: allLabel, count: items.length }, ...withCounts];
  }, [filters, items, allLabel]);

  if (items.length === 0 && emptyMessage) {
    return <p className="py-4 text-center text-xs text-slate-500">{emptyMessage}</p>;
  }

  const List = ordered ? "ol" : "ul";

  return (
    <>
      {choices && (
        <FilterChips
          label={filterLabel ?? `Filter ${nounPlural ?? `${noun}s`}`}
          value={group}
          onChange={setGroup}
          choices={choices}
        />
      )}
      {visible.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
          Nothing matches this filter.
        </p>
      ) : (
        <List className={className}>
          {rows.map((item) => (
            <li key={item.id}>{item.node}</li>
          ))}
        </List>
      )}
      <ListPager pager={pager} noun={noun} nounPlural={nounPlural} />
    </>
  );
}
