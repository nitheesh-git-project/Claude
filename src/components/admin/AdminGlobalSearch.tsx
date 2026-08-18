"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// One box that finds anything. Before this, a patient who phoned and gave a
// number could only be found by opening the Patients tab and scanning, and a
// session ID could only be filtered on one screen out of four.
//
// Everything searched here is already on the page (the dashboard loads
// people, sessions and purchases anyway), so this is a client-side filter
// rather than a new query -- no round trip, and no way for it to return
// something the viewer's own screens wouldn't show them.
export type SearchEntity = {
  id: string;
  /** What the admin will recognise: a person's name, a session's concern. */
  label: string;
  /** Everything matchable that isn't the label: email, phone, codes. */
  terms: string[];
  kind: "Patient" | "Therapist" | "Partner" | "Session" | "Purchase";
  href: string;
  /** One line of context under the result, e.g. a session's date. */
  hint?: string | null;
};

const KIND_STYLES: Record<SearchEntity["kind"], string> = {
  Patient: "bg-teal-50 text-teal-700",
  Therapist: "bg-purple-50 text-purple-700",
  Partner: "bg-blue-50 text-blue-700",
  Session: "bg-amber-50 text-amber-700",
  Purchase: "bg-slate-100 text-slate-600",
};

const MAX_RESULTS = 12;

export default function AdminGlobalSearch({ entities }: { entities: SearchEntity[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Normalised once per entity list rather than per keystroke -- this runs
  // over every person, session and purchase on the dashboard, and an admin
  // types faster than a full re-lowercase of a few thousand rows.
  const haystack = useMemo(
    () =>
      entities.map((e) => ({
        entity: e,
        text: [e.label, ...e.terms].filter(Boolean).join(" ").toLowerCase(),
      })),
    [entities]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    // Digits-only queries (a phone number) get punctuation stripped from
    // both sides, so "9876543210" still finds "+91 98765 43210".
    const digitsOnly = /^[\d+\s-]+$/.test(q);
    const needle = digitsOnly ? q.replace(/[^\d]/g, "") : q;
    if (!needle) return [];
    const out: SearchEntity[] = [];
    for (const row of haystack) {
      const text = digitsOnly ? row.text.replace(/[^\d]/g, "") : row.text;
      if (text.includes(needle)) {
        out.push(row.entity);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [query, haystack]);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      // Cmd/Ctrl+K is what every admin already expects a search box to
      // answer to, and this dashboard has no other use for it.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search name, phone, email, session ID…"
          aria-label="Search the admin dashboard"
          className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute right-0 z-40 mt-2 w-full min-w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.kind}-${r.id}`} className="border-b border-slate-100 last:border-b-0">
                  <Link
                    href={r.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-3.5 py-2.5 transition hover:bg-slate-50"
                  >
                    <span
                      className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${KIND_STYLES[r.kind]}`}
                    >
                      {r.kind}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-800">
                        {r.label}
                      </span>
                      {r.hint && (
                        <span className="block truncate text-[11px] text-slate-500">{r.hint}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
