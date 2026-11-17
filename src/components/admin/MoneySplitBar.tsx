"use client";

import { useState } from "react";
import { formatInr } from "@/lib/formatMoney";
import { COST_COLOR, HOSPITAL_CUT_COLOR, PROFIT_COLOR, THERAPIST_CUT_COLOR } from "@/components/admin/TrendCharts";

/**
 * Money › Overview's picture: one sentence and one bar saying where every
 * rupee of net revenue went over the dates in view, each part tappable for
 * what it means in plain words.
 *
 * It draws the same figures the blocks under it list -- passed in, never
 * recomputed -- so the bar and the numbers cannot disagree. Shares that
 * could not be worked out (a therapist with no revenue share set) are drawn
 * as their own grey part rather than folded into another, for the same
 * reason the screen names them under "Where the money went". A loss is
 * said in words instead of drawn: a bar cannot show a negative part.
 */
export type MoneySplitParts = {
  netRevenuePaise: number;
  refundedPaise: number;
  therapistPaise: number;
  partnerPaise: number;
  paymentFeesPaise: number;
  runningCostsPaise: number;
  operatingProfitPaise: number;
};

type Part = { key: string; label: string; paise: number; color: string; why: string };

export default function MoneySplitBar({ parts, rangeLabel }: { parts: MoneySplitParts; rangeLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const n = parts.netRevenuePaise;
  if (n <= 0) {
    return (
      <p className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600" data-testid="money-split">
        Nothing came in for sessions in these dates yet.
      </p>
    );
  }
  const profit = Math.max(0, parts.operatingProfitPaise);
  const known =
    parts.therapistPaise + parts.partnerPaise + parts.paymentFeesPaise + parts.runningCostsPaise + profit;
  const list: Part[] = [
    { key: "therapists", label: "Therapists", paise: parts.therapistPaise, color: THERAPIST_CUT_COLOR, why: "Each therapist's share of the sessions they gave, travel included. You pay it from Pay therapists." },
    { key: "partners", label: "Partner hospitals", paise: parts.partnerPaise, color: HOSPITAL_CUT_COLOR, why: "Referral commission for patients a partner hospital sent you." },
    { key: "fees", label: "Payment fees", paise: parts.paymentFeesPaise, color: "var(--chart-slate, #64748b)", why: "What Razorpay keeps for collecting the money online." },
    { key: "costs", label: "Running costs", paise: parts.runningCostsPaise, color: COST_COLOR, why: "What the clinic itself spends: rent, ads, software and everything else recorded in Costs & offers." },
    { key: "kept", label: "You kept", paise: profit, color: PROFIT_COLOR, why: "What is left after everyone else is paid: the clinic's operating profit, before tax." },
    { key: "unsplit", label: "Not split yet", paise: Math.max(0, n - known), color: "#cbd5e1", why: "Sessions whose share could not be worked out yet, usually a therapist or partner with no share set. They are listed under Where the money went." },
  ].filter((p) => p.paise > 0);
  const pct = (p: number) => (p * 100) / n;
  const shown = list.find((p) => p.key === open);

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="money-split" aria-labelledby="money-split-title">
      <h2 id="money-split-title" className="font-display text-lg font-bold leading-snug text-slate-800 sm:text-xl">
        {rangeLabel}: <span className="text-teal-700">{formatInr(n)}</span> came in
        {parts.refundedPaise > 0 ? ` after ${formatInr(parts.refundedPaise)} of refunds` : ""}.{" "}
        {parts.operatingProfitPaise >= 0 ? (
          <>
            After paying everyone, you kept <span className="text-emerald-700">{formatInr(parts.operatingProfitPaise)}</span>.
          </>
        ) : (
          <>
            Costs were <span className="text-red-600">{formatInr(-parts.operatingProfitPaise)}</span> more than
            what was left, so these dates ran at a loss.
          </>
        )}
      </h2>
      <div className="mt-4 flex h-11 w-full gap-[3px] overflow-hidden rounded-xl" role="group" aria-label="Where every rupee went">
        {list.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setOpen(open === p.key ? null : p.key)}
            aria-pressed={open === p.key}
            aria-label={`${p.label}: ${formatInr(p.paise)}, ${Math.round(pct(p.paise))} of every ₹100`}
            className="min-w-[6px] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            style={{ flexGrow: pct(p.paise), background: p.color, boxShadow: open === p.key ? "inset 0 0 0 3px #fff" : undefined }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {list.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => setOpen(open === p.key ? null : p.key)}
              aria-pressed={open === p.key}
              className={`flex h-full min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border bg-white px-3 py-2.5 text-left transition ${
                open === p.key ? "border-teal-600 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                {p.label}
              </span>
              <span className="font-display text-base font-extrabold tabular-nums text-slate-900">{formatInr(p.paise)}</span>
              <span className="text-xs text-slate-500">₹{Math.round(pct(p.paise))} of every ₹100</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 min-h-[1.5rem] text-sm text-slate-600" aria-live="polite">
        {shown ? (
          <>
            <strong className="text-slate-800">{shown.label}.</strong> {shown.why}
          </>
        ) : (
          "Tap any part to see what it means."
        )}
      </p>
    </section>
  );
}
