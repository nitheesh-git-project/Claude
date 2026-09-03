"use client";

import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import StatStrip from "@/components/dashboard/StatStrip";
import {
  DISCOUNT_SOURCES,
  DISCOUNT_SOURCE_LABELS,
  type DiscountSource,
} from "@/lib/discounts";
import {
  EXPENSE_CATEGORIES,
  expensesByCategory,
  sumExpensesPaise,
  type ExpenseRow,
} from "@/lib/operatingCosts";

/** One line each on what this rule is for, in the admin's own words. */
const DISCOUNT_SOURCE_NOTES: Record<DiscountSource, string> = {
  first_session: "What it cost to bring new patients through the door.",
  goodwill: "Taken off case by case, each with a stated reason on the session.",
  promo_code: "Claimed at checkout from a campaign you set up.",
  invite_reward: "Thanking a patient whose friend came and paid.",
  invite_welcome: "Welcoming the friend they sent.",
};

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * The clinic's running costs — what turns "clinic share" into an actual
 * profit on the Summary screen.
 *
 * Only hand-entered costs live here. The payment-gateway fee is charged per
 * transaction and is derived from the sessions that were paid for online, so
 * it is shown on Summary but is deliberately not editable as a row: nobody
 * should be able to make the fee disappear by deleting a line.
 */
export default function AdminCostsTab({
  expenses,
  gatewayFeePercent,
  discountsGiven,
  todayIso,
}: {
  expenses: ExpenseRow[];
  gatewayFeePercent: number;
  /**
   * What acquisition discounting has cost, all time.
   *
   * Reported here and deliberately **not** deducted from operating profit:
   * a discount means less was collected, so it is already inside gross
   * revenue as a smaller number, and subtracting it again would understate
   * profit by exactly the amount given away. It sits on this screen because
   * it answers a question no revenue line can — what buying those patients
   * cost — which is what decides whether an offer continues.
   */
  discountsGiven: {
    totalPaise: number;
    count: number;
    /** Split by which rule gave it away. Rendered from the shared labels
     *  rather than a tile per source written out by hand, so a discount
     *  added later appears here without this screen being edited -- the
     *  breakdown going stale is how a reported figure stops being read. */
    bySource: Record<DiscountSource, number>;
  };
  /** Today in IST, from the server — a fresh Date here would disagree with
   *  the server's HTML at hydration. */
  todayIso: string;
}) {
  const router = useRouter();
  const [incurredOn, setIncurredOn] = useState(todayIso);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState(String(gatewayFeePercent));
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeSaved, setFeeSaved] = useState(false);

  // Totals and the by-category breakdown stay over every expense in
  // range; only the row list is paged.
  const { rows: expensePage, pager: expensePager } = usePagedList(expenses, {
    storageKey: "admin-expenses",
  });

  const totalPaise = useMemo(() => sumExpensesPaise(expenses), [expenses]);
  const byCategory = useMemo(() => expensesByCategory(expenses), [expenses]);

  // This year to date, so the strip says something about the current book
  // rather than every cost ever recorded.
  const thisYearPaise = useMemo(() => {
    const year = new Date(`${todayIso}T00:00:00+05:30`).getFullYear();
    return sumExpensesPaise(
      expenses.filter((e) => Number(e.incurred_on.slice(0, 4)) === year)
    );
  }, [expenses, todayIso]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rupees = Number(amountRupees);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    // Rupees in the form, paise on the wire. Math.round because 19.99 * 100
    // is 1998.9999999999998 in binary floating point, and an amount column
    // must be an exact integer.
    const amountPaise = Math.round(rupees * 100);

    setBusy(true);
    try {
      const res = await fetch("/api/admin/expenses/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incurredOn, category, description, amountPaise }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save this cost.");
        return;
      }
      setDescription("");
      setAmountRupees("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFee(e: React.FormEvent) {
    e.preventDefault();
    setFeeError(null);
    setFeeSaved(false);
    const percent = Number(feeInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setFeeError("Enter a percentage between 0 and 100.");
      return;
    }
    setFeeBusy(true);
    try {
      const res = await fetch("/api/admin/update-setting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "payment_gateway_fee_percent", value: percent }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeeError(json.error ?? "Could not save the fee.");
        return;
      }
      setFeeSaved(true);
      router.refresh();
    } catch {
      setFeeError("Could not reach the server. Check your connection and try again.");
    } finally {
      setFeeBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/expenses/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not remove this cost.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <StatStrip
        cells={[
          {
            label: "Recorded this year",
            value: formatInr(thisYearPaise),
            note: "Costs you have entered, dated this calendar year",
            accent: "bg-amber-500",
          },
          {
            label: "Recorded all time",
            value: formatInr(totalPaise),
            note: `${expenses.length} entr${expenses.length === 1 ? "y" : "ies"}`,
            accent: "bg-slate-400",
          },
          {
            label: "Payment fees",
            value: `${gatewayFeePercent}%`,
            note: "Added automatically on everything collected online",
            accent: "bg-blue-500",
          },
          {
            label: "Discounts given",
            value: formatInr(discountsGiven.totalPaise),
            note:
              discountsGiven.count === 0
                ? "No discount has been applied yet"
                : `${discountsGiven.count} session${discountsGiven.count === 1 ? "" : "s"} — already reflected in revenue, not a cost on top`,
            accent: discountsGiven.totalPaise > 0 ? "bg-purple-500" : "bg-slate-400",
          },
          {
            label: "Biggest category",
            value: byCategory[0]?.category ?? "—",
            note: byCategory[0] ? formatInr(byCategory[0].amountPaise) : "Nothing recorded yet",
            accent: "bg-teal-500",
          },
        ]}
      />

      {discountsGiven.totalPaise > 0 && (
        <SurfaceCard
          title="What discounting cost"
          icon="fa-tags"
          subtitle="Money not collected because an offer or an adjustment applied. Already reflected in revenue — this is not a second cost."
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            {DISCOUNT_SOURCES.filter((source) => discountsGiven.bySource[source] > 0).map(
              (source) => (
                <div key={source} className="rounded-xl border border-slate-200 p-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {DISCOUNT_SOURCE_LABELS[source]}
                  </dt>
                  <dd className="mt-1 text-lg font-bold text-slate-900">
                    {formatInr(discountsGiven.bySource[source])}
                  </dd>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {DISCOUNT_SOURCE_NOTES[source]}
                  </p>
                </div>
              )
            )}
          </dl>
        </SurfaceCard>
      )}

      {/* The fee lives here rather than in Settings on purpose: the person
          reconciling costs is the person who knows what the processor
          actually charges, and it is the only cost on this screen they
          cannot enter as a line. */}
      <SurfaceCard
        title="Payment processing fee"
        icon="fa-credit-card"
        subtitle="Charged by the payment gateway on everything collected online. Applied automatically — you never enter it as a cost."
      >
        <form onSubmit={saveFee} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-500">Fee (% of amount collected)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={feeInput}
              onChange={(e) => {
                setFeeInput(e.target.value);
                setFeeSaved(false);
              }}
              className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          <button
            type="submit"
            disabled={feeBusy}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
          >
            {feeBusy ? "Saving…" : "Save fee"}
          </button>
          {feeSaved && !feeError && (
            <span className="text-xs font-semibold text-emerald-700">Saved</span>
          )}
          {feeError && <span className="text-xs font-semibold text-red-700">{feeError}</span>}
        </form>
        <p className="mt-3 text-[11px] text-slate-400">
          Razorpay&apos;s standard domestic rate is around 2%, plus GST — check your own plan.
          Cash-on-visit collections never touch the gateway and are excluded.
        </p>
      </SurfaceCard>

      <SurfaceCard
        title="Record a cost"
        icon="fa-receipt"
        subtitle="Salaries, rent, software, anything the clinic pays for. These come off the clinic's share on Summary to give the real profit."
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-500">Date incurred</span>
            <input
              type="date"
              required
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-500">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs lg:col-span-2">
            <span className="font-semibold text-slate-500">What was it for</span>
            <input
              type="text"
              maxLength={500}
              placeholder="Optional — e.g. Physio couch, monthly Zoom plan"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-500">Amount (₹)</span>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-5">
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Record cost"}
            </button>
          </div>
        </form>
      </SurfaceCard>

      {byCategory.length > 0 && (
        <SurfaceCard title="By category" icon="fa-tags" subtitle="All time.">
          <ul className="space-y-2">
            {byCategory.map((c) => (
              <li key={c.category} className="flex items-center gap-3 text-xs">
                <span className="w-36 shrink-0 truncate font-semibold text-slate-700">
                  {c.category}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-4 rounded-full bg-amber-500"
                    style={{
                      width: `${(c.amountPaise / byCategory[0].amountPaise) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-24 text-right font-bold text-slate-900">
                  {formatInr(c.amountPaise)}
                </span>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      )}

      <SurfaceCard title="Everything recorded" icon="fa-list-ul">
        {expenses.length === 0 ? (
          <EmptyState
            icon="fa-receipt"
            title="No costs recorded yet"
            body="Until the clinic's own costs are in here, Summary can only show what is left after the therapist and partner shares — not what the business actually kept."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-400">
                  <th className="pb-2 pr-3 font-semibold">Date</th>
                  <th className="pb-2 pr-3 font-semibold">Category</th>
                  <th className="pb-2 pr-3 font-semibold">What for</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {expensePage.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 text-slate-700">{formatDate(e.incurred_on)}</td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{e.category}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{e.description ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-slate-900 tabular-nums">
                      {formatInr(e.amount_paise)}
                    </td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        disabled={deletingId === e.id}
                        className="font-semibold text-red-600 transition hover:underline disabled:opacity-50"
                      >
                        {deletingId === e.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ListPager pager={expensePager} noun="expense" />
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
