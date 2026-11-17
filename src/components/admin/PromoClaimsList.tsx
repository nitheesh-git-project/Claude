"use client";

import { useMemo, useState } from "react";
import Link from "@/components/system/ProgressLink";
import DateField from "@/components/system/DateField";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { formatInr } from "@/lib/formatMoney";
import { istDateKey } from "@/lib/formatSlotRange";
import {
  PROMO_CLAIM_KIND_LABEL,
  PROMO_CLAIM_STATE_LABEL,
  filterPromoClaims,
  type PromoClaim,
  type PromoClaimKind,
  type PromoClaimState,
} from "@/lib/promoClaims";

const STATE_TONE: Record<PromoClaimState, string> = {
  paid: "bg-teal-50 text-teal-800",
  unpaid: "bg-amber-50 text-amber-800",
  cancelled: "bg-slate-100 text-slate-600",
};

/**
 * Who claimed which code, under the codes on Money -> Costs. Opens on the
 * successful claims (paid); the filters widen it. Each row's patient ID and
 * Open profile go to the same patient pop-up People -> Patients opens.
 * Null claims means the read failed -- said so, never shown as "nobody".
 */
export default function PromoClaimsList({
  claims,
  codes,
}: {
  claims: PromoClaim[] | null;
  codes: { id: string; code: string }[];
}) {
  const [query, setQuery] = useState("");
  const [codeId, setCodeId] = useState("");
  const [kind, setKind] = useState<PromoClaimKind | "all">("all");
  const [state, setState] = useState<PromoClaimState | "all">("paid");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const shown = useMemo(
    () => (claims ? filterPromoClaims(claims, { query, codeId, kind, state, from, to }, istDateKey) : []),
    [claims, query, codeId, kind, state, from, to]
  );
  const totalOff = shown.reduce((sum, c) => sum + c.discountPaise, 0);
  const filtered = query || codeId || kind !== "all" || state !== "paid" || from || to;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="promo-claims">
      <h3 className="font-display text-lg font-bold text-slate-800">Who claimed a code</h3>
      <p className="mt-1 text-xs text-slate-500">
        Every patient who used a promo code, on what, and how much it took off. Showing paid claims; choose
        &quot;Any status&quot; to see checkouts that were never paid or were cancelled.
      </p>

      {claims === null ? (
        <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          The claims could not be loaded just now. Refresh to try again - this does not mean nobody has used a code.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="search"
              aria-label="Search claims by patient, ID or code"
              placeholder="Patient name, ID or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-xs"
            />
            <select aria-label="Filter by code" value={codeId} onChange={(e) => setCodeId(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs">
              <option value="">All codes</option>
              {codes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
            <select aria-label="Filter by what it was used on" value={kind} onChange={(e) => setKind(e.target.value as PromoClaimKind | "all")} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs">
              <option value="all">Sessions and programmes</option>
              {(Object.keys(PROMO_CLAIM_KIND_LABEL) as PromoClaimKind[]).map((k) => (
                <option key={k} value={k}>
                  {PROMO_CLAIM_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select aria-label="Filter by payment" value={state} onChange={(e) => setState(e.target.value as PromoClaimState | "all")} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs">
              <option value="paid">Paid (successful)</option>
              <option value="unpaid">Not paid yet</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">Any status</option>
            </select>
          </div>
          <div className="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-600">Claimed from</p>
              <DateField value={from} onChange={setFrom} ariaLabel="Claimed from" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-600">To</p>
              <DateField value={to} onChange={setTo} ariaLabel="Claimed to" />
            </div>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCodeId("");
                  setKind("all");
                  setState("paid");
                  setFrom("");
                  setTo("");
                }}
                className="h-10 justify-self-start text-xs font-semibold text-teal-700 hover:underline lg:col-start-4 lg:justify-self-end"
              >
                Clear filters
              </button>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-600" role="status">
            {shown.length} {shown.length === 1 ? "claim" : "claims"}
            {shown.length > 0 && <> · {formatInr(totalOff)} off in all</>}
          </p>

          {shown.length === 0 ? (
            <p className="mt-2 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">
              {claims.length === 0 ? "No code has been claimed yet." : "No claims match these filters."}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {shown.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs" data-testid="promo-claim-row">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{c.patientName}</span>
                      {c.patientCode && (
                        <Link
                          href={`/admin/dashboard/patients/${c.patientId}`}
                          className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          {c.patientCode}
                        </Link>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_TONE[c.state]}`}>
                        {PROMO_CLAIM_STATE_LABEL[c.state]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-slate-600">
                      <span className="font-mono font-semibold text-slate-800">{c.code}</span>
                      {c.campaign && <> · {c.campaign}</>} · {PROMO_CLAIM_KIND_LABEL[c.kind]}: {c.forWhat}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {c.claimedAt ? formatClinicDateTime(c.claimedAt) : "Date not recorded"} ·{" "}
                      <span className="font-semibold text-slate-700">{formatInr(c.discountPaise)} off</span>
                    </p>
                  </div>
                  <Link
                    href={`/admin/dashboard/patients/${c.patientId}`}
                    className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-800 transition hover:border-teal-500"
                  >
                    Open profile
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
