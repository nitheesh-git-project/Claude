"use client";

import { useMemo, useState, type ReactNode } from "react";
import PagedList, { type PagedListItem } from "@/components/dashboard/PagedList";

// Name search over the referral rows a Server Component already rendered.
// The rows keep their finished markup; this only decides which are on screen,
// so a partner with a long history can find one patient without paging.
export type ReferralListItem = PagedListItem & { name: string };

export default function ReferralsList({
  items,
  filters,
  showChips = true,
}: {
  items: ReferralListItem[];
  filters: { key: string; label: string }[];
  /** False when the list was already narrowed by a link from the Overview. */
  showChips?: boolean;
}): ReactNode {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items),
    [items, needle]
  );

  return (
    <>
      <label className="mb-4 block">
        <span className="sr-only">Search referrals by patient name</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by patient name"
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-slate-300 p-2.5 text-base sm:max-w-sm sm:text-sm"
        />
      </label>
      {visible.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
          No referral matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <PagedList
          noun="referral"
          storageKey="hospital-referrals"
          defaultPageSize={10}
          className="space-y-3"
          filters={showChips ? filters : undefined}
          items={visible}
        />
      )}
    </>
  );
}
