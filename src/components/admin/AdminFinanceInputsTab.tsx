"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useSaveSetting } from "@/lib/useSaveSetting";
import { adminScreenHref } from "@/lib/adminNav";
import {
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNEL_SOURCES,
  RUN_RATE_BASES,
  type BalanceSheetEntry,
  type CapitalInvestment,
  type FinanceSettings,
  type MarketingCampaign,
  type MarketingChannel,
  type RunRateBasis,
} from "@/lib/financeMetrics";

// Your Numbers: the four things Business Health cannot work out on its own.
//
// Everything about sessions, therapists, partners and payment fees comes from
// this app's own bookings. What was **put into** the business, what was spent
// on **advertising**, and what the clinic **owns and owes** outside its own
// tables are facts only the owner has -- and a figure an owner has to go and
// look up is a figure they will guess at unless the form says where to find
// it. So every field here names its source: the bank statement, the Google
// Ads billing page, the invoice.
//
// A screen of its own rather than panels under Business Health, because the
// two are used differently: that screen is read at a glance and often, this
// one is sat down with once a month.

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Rupees in the form, paise on the wire. Math.round because 19.99 * 100 is
 *  1998.9999999999998 in binary floating point and an amount column must be
 *  an exact integer. */
function rupeesToPaise(value: string): number | null {
  const rupees = Number(value);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

function paiseToRupees(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? "" : String(paise / 100);
}

const RUN_RATE_LABELS: Record<RunRateBasis, string> = {
  auto: "Fit to the dates I pick",
  weekly: "Treat the period as a week (× 52)",
  monthly: "Treat the period as a month (× 12)",
  quarterly: "Treat the period as a quarter (× 4)",
};

type PromoOption = { id: string; code: string };

export default function AdminFinanceInputsTab({
  investments,
  campaigns,
  balanceEntries,
  promoCodes,
  settings,
  todayIso,
}: {
  investments: CapitalInvestment[];
  campaigns: MarketingCampaign[];
  balanceEntries: BalanceSheetEntry[];
  /** Campaigns are traced by promo code, so the form offers the codes that
   *  exist rather than a text box somebody can mistype. */
  promoCodes: PromoOption[];
  settings: FinanceSettings;
  /** Today in IST, from the server - a fresh Date here would disagree with
   *  the server's HTML at hydration. */
  todayIso: string;
}) {
  return (
    <div className="space-y-6">
      <SurfaceCard title="What this screen is for" icon="fa-circle-info">
        <p className="text-xs leading-relaxed text-slate-600">
          Four things decide half the figures on{" "}
          <a
            href={adminScreenHref("money", "health")}
            className="font-semibold text-teal-700 hover:underline"
          >
            Business Health
          </a>{" "}
          and none of them is anything this app can see: what you have put into the clinic, what you
          spend on advertising, what you own and owe outside this app, and how you want a few of
          those figures read. Enter them here and every figure on that screen fills in. Leave one
          out and that screen says which figure it cannot work out, rather than showing a zero.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Interest and tax are the fifth, and they are not here: they are ordinary costs, recorded on{" "}
          <a
            href={adminScreenHref("money", "costs")}
            className="font-semibold text-teal-700 hover:underline"
          >
            Costs
          </a>{" "}
          and filed under their own kind.
        </p>
      </SurfaceCard>

      <InvestmentsPanel investments={investments} todayIso={todayIso} />
      <CampaignsPanel campaigns={campaigns} promoCodes={promoCodes} todayIso={todayIso} />
      <BalancePanel entries={balanceEntries} todayIso={todayIso} />
      <ReadingsPanel settings={settings} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// What you invested
// ---------------------------------------------------------------------------

function InvestmentsPanel({
  investments,
  todayIso,
}: {
  investments: CapitalInvestment[];
  todayIso: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CapitalInvestment | null>(null);
  const [label, setLabel] = useState("");
  const [investedOn, setInvestedOn] = useState(todayIso);
  const [amount, setAmount] = useState("");
  const [presentValue, setPresentValue] = useState("");
  const [valuedOn, setValuedOn] = useState(todayIso);
  const [life, setLife] = useState("");
  const [writeOffAs, setWriteOffAs] = useState("depreciation");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { rows, pager } = usePagedList(investments, { storageKey: "admin-investments" });
  const total = investments.reduce((sum, i) => sum + Math.max(0, i.amount_paise), 0);

  function startEdit(investment: CapitalInvestment) {
    setEditing(investment);
    setLabel(investment.label);
    setInvestedOn(investment.invested_on);
    setAmount(paiseToRupees(investment.amount_paise));
    setPresentValue(paiseToRupees(investment.present_value_paise));
    setValuedOn(investment.present_value_as_of ?? todayIso);
    setLife(investment.useful_life_months === null ? "" : String(investment.useful_life_months));
    setWriteOffAs(investment.write_off_as === "amortization" ? "amortization" : "depreciation");
    setError(null);
  }

  function reset() {
    setEditing(null);
    setLabel("");
    setInvestedOn(todayIso);
    setAmount("");
    setPresentValue("");
    setValuedOn(todayIso);
    setLife("");
    setWriteOffAs("depreciation");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountPaise = rupeesToPaise(amount);
    if (amountPaise === null || amountPaise <= 0) {
      setError("Enter what it cost, as a number greater than zero.");
      return;
    }
    const presentValuePaise = presentValue.trim() === "" ? null : rupeesToPaise(presentValue);
    if (presentValue.trim() !== "" && presentValuePaise === null) {
      setError("What it is worth now has to be a number, or left empty.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/finance/investment/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing?.id ?? null,
          label,
          investedOn,
          amountPaise,
          presentValuePaise,
          presentValueAsOf: presentValuePaise === null ? null : valuedOn,
          usefulLifeMonths: life.trim() === "" ? null : Number(life),
          writeOffAs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save this.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      const res = await fetch("/api/admin/finance/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "investment", id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not remove this.");
        return;
      }
      if (editing?.id === id) reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <SurfaceCard
      title="What you have put into the clinic"
      icon="fa-sack-dollar"
      subtitle="Equipment, the fit-out, laptops, the website build - anything you bought once rather than pay for monthly. This is the figure your return on investment is measured against."
    >
      <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Where to find these</p>
        <p className="mt-1">
          The invoice or receipt for what it cost, and the date on it. Your accountant&apos;s
          fixed-asset register has all of them together, if you have one. &ldquo;What it is worth
          now&rdquo; is your own judgement - what you would get for it today - and is only used for
          the second return figure; leave it empty until you have a view.
        </p>
        <p className="mt-1">
          A life in months is what turns a purchase into a monthly cost. A physio couch you expect to
          last five years is 60; a laptop, 36; a website build, 36 as an amortization rather than a
          depreciation. Leave it empty and the purchase is never charged to a period at all.
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs lg:col-span-2">
          <span className="font-semibold text-slate-500">What is it</span>
          <input
            type="text"
            required
            maxLength={120}
            placeholder="Physio couch, clinic laptops, website build"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Date you bought it</span>
          <input
            type="date"
            required
            value={investedOn}
            onChange={(e) => setInvestedOn(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">What it cost (₹)</span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Worth now (₹, optional)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={presentValue}
            onChange={(e) => setPresentValue(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        {presentValue.trim() !== "" && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-500">Valued on</span>
            <input
              type="date"
              required
              value={valuedOn}
              onChange={(e) => setValuedOn(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Life (months, optional)</span>
          <input
            type="number"
            min="1"
            max="600"
            step="1"
            placeholder="60"
            value={life}
            onChange={(e) => setLife(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Written off as</span>
          <select
            value={writeOffAs}
            onChange={(e) => setWriteOffAs(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          >
            <option value="depreciation">Depreciation (something physical)</option>
            <option value="amortization">Amortization (software, a website, a licence)</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          {error && (
            <p className="mr-auto rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add investment"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        {investments.length === 0 ? (
          <EmptyState
            icon="fa-sack-dollar"
            title="Nothing recorded yet"
            body="Until something is here, Business Health cannot show a return on investment - there is nothing to measure a return against."
          />
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              {investments.length} recorded, {formatInr(total)} in total
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">What</th>
                  <th className="pb-2 pr-3 font-semibold">Bought</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Cost</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Worth now</th>
                  <th className="pb-2 pr-3 font-semibold">Written off</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((investment) => (
                  <tr key={investment.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{investment.label}</td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {formatDate(investment.invested_on)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-slate-900">
                      {formatInr(investment.amount_paise)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">
                      {investment.present_value_paise === null ? (
                        <span className="text-slate-500">Not valued</span>
                      ) : (
                        <>
                          {formatInr(investment.present_value_paise)}
                          <span className="block text-[10px] text-slate-500">
                            as of {formatDate(investment.present_value_as_of)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {investment.useful_life_months
                        ? `${investment.write_off_as === "amortization" ? "Amortized" : "Depreciated"} over ${
                            investment.useful_life_months
                          } months`
                        : "Not written off"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(investment)}
                        className="mr-3 font-semibold text-teal-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(investment.id)}
                        disabled={removingId === investment.id}
                        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {removingId === investment.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ListPager pager={pager} noun="investment" />
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Advertising
// ---------------------------------------------------------------------------

function CampaignsPanel({
  campaigns,
  promoCodes,
  todayIso,
}: {
  campaigns: MarketingCampaign[];
  promoCodes: PromoOption[];
  todayIso: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<MarketingChannel>("google");
  const [startsOn, setStartsOn] = useState(todayIso);
  const [endsOn, setEndsOn] = useState("");
  const [spend, setSpend] = useState("");
  const [promoCodeId, setPromoCodeId] = useState("");
  const [attributed, setAttributed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { rows, pager } = usePagedList(campaigns, { storageKey: "admin-campaigns" });
  const codeNameById = useMemo(
    () => Object.fromEntries(promoCodes.map((c) => [c.id, c.code])),
    [promoCodes]
  );

  function startEdit(campaign: MarketingCampaign) {
    setEditing(campaign);
    setName(campaign.name);
    setChannel((campaign.channel as MarketingChannel) ?? "other");
    setStartsOn(campaign.starts_on);
    setEndsOn(campaign.ends_on ?? "");
    setSpend(paiseToRupees(campaign.spend_paise));
    setPromoCodeId(campaign.promo_code_id ?? "");
    setAttributed(paiseToRupees(campaign.attributed_revenue_paise));
    setError(null);
  }

  function reset() {
    setEditing(null);
    setName("");
    setChannel("google");
    setStartsOn(todayIso);
    setEndsOn("");
    setSpend("");
    setPromoCodeId("");
    setAttributed("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const spendPaise = rupeesToPaise(spend);
    if (spendPaise === null) {
      setError("Enter what it cost, as a number.");
      return;
    }
    const attributedPaise = attributed.trim() === "" ? null : rupeesToPaise(attributed);
    if (attributed.trim() !== "" && attributedPaise === null) {
      setError("What you believe it brought in has to be a number, or left empty.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/finance/campaign/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing?.id ?? null,
          name,
          channel,
          startsOn,
          endsOn: endsOn === "" ? null : endsOn,
          spendPaise,
          promoCodeId: promoCodeId === "" ? null : promoCodeId,
          attributedRevenuePaise: attributedPaise,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save this campaign.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      const res = await fetch("/api/admin/finance/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "campaign", id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not remove this campaign.");
        return;
      }
      if (editing?.id === id) reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <SurfaceCard
      title="What you spend on advertising"
      icon="fa-bullhorn"
      subtitle="One row per campaign per stretch of dates. Business Health spreads each row evenly across its own days, so any date range you pick gets the right share of it."
    >
      <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Where to find the spend</p>
        <p className="mt-1">{MARKETING_CHANNEL_SOURCES[channel]}</p>
        <p className="mt-2 font-semibold text-slate-700">How the revenue gets traced</p>
        <p className="mt-1">
          Give the campaign a promo code and advertise that code in the ad. Every booking that types
          it is then traceable to this campaign, and the return is real rather than a guess. Set up
          codes on{" "}
          <a
            href={adminScreenHref("money", "costs")}
            className="font-semibold text-teal-700 hover:underline"
          >
            Costs
          </a>
          . For an ad that makes the phone ring instead, put what you believe it brought in in the
          last box - Business Health will show it as your own figure, never as a traced one.
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs lg:col-span-2">
          <span className="font-semibold text-slate-500">Campaign name</span>
          <input
            type="text"
            required
            maxLength={120}
            placeholder="March knee-pain campaign"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Where it ran</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as MarketingChannel)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          >
            {MARKETING_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {MARKETING_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Spend (₹)</span>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Started</span>
          <input
            type="date"
            required
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Ended (empty = still running)</span>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Traced by promo code</span>
          <select
            value={promoCodeId}
            onChange={(e) => setPromoCodeId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          >
            <option value="">Not traced by a code</option>
            {promoCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Or: revenue you attribute (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Only if no code"
            value={attributed}
            onChange={(e) => setAttributed(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          {error && (
            <p className="mr-auto rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add campaign"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        {campaigns.length === 0 ? (
          <EmptyState
            icon="fa-bullhorn"
            title="No advertising recorded"
            body="Business Health cannot show a return on ad spend until there is spend to measure. If you do not advertise, that card will simply say so."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">Campaign</th>
                  <th className="pb-2 pr-3 font-semibold">Where</th>
                  <th className="pb-2 pr-3 font-semibold">Dates</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Spend</th>
                  <th className="pb-2 pr-3 font-semibold">Traced by</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{campaign.name}</td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {MARKETING_CHANNEL_LABELS[
                        campaign.channel as keyof typeof MARKETING_CHANNEL_LABELS
                      ] ?? campaign.channel}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {formatDate(campaign.starts_on)} –{" "}
                      {campaign.ends_on ? formatDate(campaign.ends_on) : "still running"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-slate-900">
                      {formatInr(campaign.spend_paise)}
                    </td>
                    <td className="py-2.5 pr-3 text-[11px]">
                      {campaign.promo_code_id ? (
                        <span className="text-teal-700">
                          Code {codeNameById[campaign.promo_code_id] ?? "(removed)"}
                        </span>
                      ) : campaign.attributed_revenue_paise !== null ? (
                        <span className="text-amber-700">
                          Your figure: {formatInr(campaign.attributed_revenue_paise)}
                        </span>
                      ) : (
                        <span className="text-slate-500">Not traced</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(campaign)}
                        className="mr-3 font-semibold text-teal-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(campaign.id)}
                        disabled={removingId === campaign.id}
                        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {removingId === campaign.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ListPager pager={pager} noun="campaign" />
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// What you own and owe
// ---------------------------------------------------------------------------

function BalancePanel({
  entries,
  todayIso,
}: {
  entries: BalanceSheetEntry[];
  todayIso: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<BalanceSheetEntry | null>(null);
  const [asOf, setAsOf] = useState(todayIso);
  const [side, setSide] = useState<"asset" | "liability">("asset");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { rows, pager } = usePagedList(entries, { storageKey: "admin-balance-entries" });
  const latest = entries.reduce<string | null>(
    (newest, e) => (newest === null || e.as_of > newest ? e.as_of : newest),
    null
  );

  function startEdit(entry: BalanceSheetEntry) {
    setEditing(entry);
    setAsOf(entry.as_of);
    setSide(entry.side === "liability" ? "liability" : "asset");
    setLabel(entry.label);
    setAmount(paiseToRupees(entry.amount_paise));
    setError(null);
  }

  function reset() {
    setEditing(null);
    setAsOf(todayIso);
    setSide("asset");
    setLabel("");
    setAmount("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountPaise = rupeesToPaise(amount);
    if (amountPaise === null) {
      setError("Enter the amount as a number. Never a minus - the side says which way it points.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/finance/balance-entry/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing?.id ?? null, asOf, side, label, amountPaise }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save this entry.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      const res = await fetch("/api/admin/finance/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "balance", id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not remove this entry.");
        return;
      }
      if (editing?.id === id) reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <SurfaceCard
      title="What you own and owe"
      icon="fa-scale-unbalanced"
      subtitle="A dated snapshot, not a running balance. Every entry sharing one date is one snapshot, and Business Health reads the most recent one - so entering this month's figures does not erase last month's."
    >
      <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Where to find these</p>
        <p className="mt-1">
          <span className="font-semibold">Own:</span> the closing balance on your bank statement,
          cash in the drawer, and anything invoiced and not yet paid to you.{" "}
          <span className="font-semibold">Owe:</span> your GST or income-tax provision from your
          accountant, bills received and unpaid, and the next twelve months of any loan.
        </p>
        <p className="mt-1">
          Only things falling within the year. A building or a five-year loan belongs on a balance
          sheet, not here - working capital is about what is due soon.
        </p>
        <p className="mt-1">
          Do not enter what therapists are owed, cash they are holding, refunds still to hand back,
          or sessions patients have paid for and not used: this app already knows all four and adds
          them itself.
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">True as of</span>
          <input
            type="date"
            required
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Which is it</span>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "asset" | "liability")}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          >
            <option value="asset">Something you own</option>
            <option value="liability">Something you owe</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">What is it</span>
          <input
            type="text"
            required
            maxLength={120}
            placeholder="Bank balance, GST due"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Amount (₹)</span>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5"
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          {error && (
            <p className="mr-auto rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add entry"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        {entries.length === 0 ? (
          <EmptyState
            icon="fa-scale-unbalanced"
            title="Nothing entered yet"
            body="Start with today's bank balance. Working capital fills in as soon as there is one figure on each side."
          />
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              Latest snapshot: {formatDate(latest)}
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">As of</th>
                  <th className="pb-2 pr-3 font-semibold">Which</th>
                  <th className="pb-2 pr-3 font-semibold">What</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  // An older snapshot is marked with a tinted row and the
                  // words "older snapshot", never with opacity: dimming drags
                  // every colour in the row under AA at once (slate-500 text
                  // fell to 2.29:1), so the rows a reader most needs to tell
                  // apart became the ones hardest to read.
                  <tr
                    key={entry.id}
                    className={`border-b border-slate-100 ${
                      entry.as_of === latest ? "" : "bg-slate-50"
                    }`}
                  >
                    <td className="py-2.5 pr-3 text-slate-500">
                      {formatDate(entry.as_of)}
                      {entry.as_of !== latest && (
                        <span className="block text-[10px] text-slate-500">older snapshot</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          entry.side === "liability"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {entry.side === "liability" ? "Owe" : "Own"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{entry.label}</td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-slate-900">
                      {formatInr(entry.amount_paise)}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="mr-3 font-semibold text-teal-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(entry.id)}
                        disabled={removingId === entry.id}
                        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {removingId === entry.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ListPager pager={pager} noun="entry" />
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// How the figures are read
// ---------------------------------------------------------------------------

function ReadingsPanel({ settings }: { settings: FinanceSettings }) {
  const router = useRouter();
  const saveSetting = useSaveSetting();
  const [state, setState] = useState(settings);
  const [price, setPrice] = useState(paiseToRupees(settings.breakEvenPricePaise));
  const [cost, setCost] = useState(paiseToRupees(settings.breakEvenVariableCostPaise));
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function toggle(key: keyof FinanceSettings, column: string, next: boolean) {
    // Optimistic, and rolled back on a throw -- useSaveSetting rethrows for
    // exactly this.
    setState((s) => ({ ...s, [key]: next }));
    setBusyKey(column);
    try {
      await saveSetting(column, next);
      router.refresh();
    } catch {
      setState((s) => ({ ...s, [key]: !next }));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveOverride(column: string, raw: string) {
    const value = raw.trim() === "" ? null : rupeesToPaise(raw);
    if (raw.trim() !== "" && value === null) return;
    setBusyKey(column);
    try {
      await saveSetting(column, value);
      router.refresh();
    } catch {
      // The toast has already said so; the field keeps what was typed so it
      // can be tried again.
    } finally {
      setBusyKey(null);
    }
  }

  const switches: {
    key: keyof FinanceSettings;
    column: string;
    label: string;
    hint: string;
    value: boolean;
  }[] = [
    {
      key: "cogsIncludesTherapistShare",
      column: "finance_cogs_therapist_share",
      label: "Therapists' share is a cost of delivering a session",
      hint: "On is the usual reading: no session, no share. Off moves it to overheads, which raises gross margin and changes nothing about what you keep.",
      value: state.cogsIncludesTherapistShare,
    },
    {
      key: "cogsIncludesPartnerShare",
      column: "finance_cogs_partner_share",
      label: "Partners' share is a cost of delivering a session",
      hint: "A referring hospital's commission is earned on the session, so on is the usual reading.",
      value: state.cogsIncludesPartnerShare,
    },
    {
      key: "cogsIncludesPaymentFees",
      column: "finance_cogs_payment_fees",
      label: "Payment fees are a cost of delivering a session",
      hint: "Charged per payment, so most clinics count them here. Some treat them as a banking overhead instead.",
      value: state.cogsIncludesPaymentFees,
    },
    {
      key: "includeAppBalances",
      column: "finance_include_app_balances",
      label: "Include the balances this app already knows in working capital",
      hint: "What therapists are owed, cash they are holding, refunds to hand back, and sessions paid for but not used. On unless you track all four somewhere else and would be double-counting.",
      value: state.includeAppBalances,
    },
  ];

  return (
    <SurfaceCard
      title="How these figures are read"
      icon="fa-sliders"
      subtitle="Judgements rather than facts. None of these changes a rupee that moved - they change how the same money is grouped, which is what makes one clinic's margin comparable with another's."
    >
      <ul className="space-y-3">
        {switches.map((row) => (
          <li key={row.column} className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={row.value}
                disabled={busyKey === row.column}
                onChange={(e) => toggle(row.key, row.column, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-xs font-semibold text-slate-800">{row.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                  {row.hint}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-800">Break-even: price of a session</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Leave empty to use what your own sessions actually charged in the dates being viewed.
            Enter a figure only when you are modelling a change.
          </p>
          <div className="mt-2 flex items-end gap-2">
            {/* aria-label rather than a wrapping <label>: the visible heading
                above is an ordinary paragraph inside a card, so without this
                the box is announced as nothing at all -- a number field under
                a heading is exactly the case the naming rule names. The two
                Save buttons need it too: on their own they are two controls
                called "Save" in one card. */}
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label="Break-even: price of a session, in rupees"
              placeholder="From my sessions"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              aria-label="Save the break-even price of a session"
              disabled={busyKey === "finance_break_even_price_paise"}
              onClick={() => saveOverride("finance_break_even_price_paise", price)}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-800">
            Break-even: cost of delivering one session
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Same rule. Empty means the average of what your own sessions cost to deliver, which is
            the therapist&apos;s share, any travel and the payment fee.
          </p>
          <div className="mt-2 flex items-end gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label="Break-even: cost of delivering one session, in rupees"
              placeholder="From my sessions"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              aria-label="Save the break-even cost of delivering one session"
              disabled={busyKey === "finance_break_even_variable_cost_paise"}
              onClick={() => saveOverride("finance_break_even_variable_cost_paise", cost)}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-800">How a period is stretched to a year</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          What the revenue run rate multiplies by. Fitting it to the dates is right for most
          readings; pick a fixed one when you always look at the same length of period.
        </p>
        <select
          aria-label="How a period is stretched to a year"
          value={state.runRateBasis}
          disabled={busyKey === "finance_run_rate_basis"}
          onChange={async (e) => {
            const next = e.target.value as RunRateBasis;
            const previous = state.runRateBasis;
            setState((s) => ({ ...s, runRateBasis: next }));
            setBusyKey("finance_run_rate_basis");
            try {
              await saveSetting("finance_run_rate_basis", next);
              router.refresh();
            } catch {
              setState((s) => ({ ...s, runRateBasis: previous }));
            } finally {
              setBusyKey(null);
            }
          }}
          className="mt-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        >
          {RUN_RATE_BASES.map((basis) => (
            <option key={basis} value={basis}>
              {RUN_RATE_LABELS[basis]}
            </option>
          ))}
        </select>
      </div>
    </SurfaceCard>
  );
}
