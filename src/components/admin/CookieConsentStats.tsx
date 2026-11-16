"use client";

import { useCallback, useEffect, useState } from "react";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import {
  CONSENT_ACTION_LABELS,
  percentOf,
  type ConsentAction,
  type ConsentSummary,
} from "@/lib/cookieConsent";

// Settings -> Cookie consent. What visitors chose in the cookie pop-up, over
// the last 7, 30 or 90 days, and the latest choices. Self-fetching from
// /api/admin/cookie-consents (requireAdminScope("settings")).
//
// A failed read says so and offers a retry; it never shows zeros, which would
// read as "nobody has chosen anything".

type Recent = {
  created_at: string;
  action: ConsentAction;
  analytics: boolean;
  marketing: boolean;
  policy_version: string;
  page_path: string | null;
  country: string | null;
  signed_in: boolean;
};

type Payload = { days: number; summary: ConsentSummary; capped: boolean; recent: Recent[] };

const RANGES = [7, 30, 90] as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

export default function CookieConsentStats() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cookie-consents?days=${range}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as Payload | { error?: string } | null;
      if (!res.ok || !body || !("summary" in body)) {
        setError(
          body && "error" in body && typeof body.error === "string"
            ? body.error
            : "The cookie choices could not be loaded."
        );
        setData(null);
      } else {
        setData(body);
      }
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount and on a range change is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(days);
  }, [days, load]);

  const s = data?.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Every choice made in the cookie pop-up. No names or contact details are kept.
        </p>
        <div role="group" aria-label="Time range" className="flex gap-1 rounded-full bg-slate-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`min-h-9 rounded-full px-3 text-sm font-semibold transition ${
                days === r ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}{" "}
          <button type="button" onClick={() => void load(days)} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : loading && !data ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : s ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Choices made" value={String(s.total)} sub={data?.capped ? "Showing the most recent 20,000" : undefined} />
            <Stat label="Accepted all" value={`${percentOf(s.acceptAll, s.total)}%`} sub={`${s.acceptAll} visitors`} />
            <Stat label="Rejected all" value={`${percentOf(s.rejectAll + s.dismissed, s.total)}%`} sub={`${s.rejectAll} rejected, ${s.dismissed} closed it`} />
            <Stat label="Chose their own" value={`${percentOf(s.custom, s.total)}%`} sub={`${s.custom} visitors`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Analytics allowed" value={`${percentOf(s.analyticsOn, s.total)}%`} sub={`${s.analyticsOn} of ${s.total}`} />
            <Stat label="Marketing allowed" value={`${percentOf(s.marketingOn, s.total)}%`} sub={`${s.marketingOn} of ${s.total}`} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Latest choices</h3>
            {data && data.recent.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600">Nobody has made a choice in the last {days} days.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold">When</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Choice</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Analytics</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Marketing</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Page</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Country</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Signed in</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Policy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {data?.recent.map((r, i) => (
                      <tr key={`${r.created_at}-${i}`}>
                        <td className="whitespace-nowrap px-4 py-2">{formatClinicDateTime(r.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{CONSENT_ACTION_LABELS[r.action]}</td>
                        <td className="px-4 py-2">{r.analytics ? "Yes" : "No"}</td>
                        <td className="px-4 py-2">{r.marketing ? "Yes" : "No"}</td>
                        <td className="px-4 py-2">{r.page_path ?? "-"}</td>
                        <td className="px-4 py-2">{r.country ?? "-"}</td>
                        <td className="px-4 py-2">{r.signed_in ? "Yes" : "No"}</td>
                        <td className="whitespace-nowrap px-4 py-2">{r.policy_version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
