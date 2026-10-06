"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { formatInr } from "@/lib/formatMoney";
import {
  COUNTRIES,
  MAX_MARKUP_PERCENT,
  currencySymbol,
  formatMinor,
  isValidMarkup,
  priceForCountry,
  rateAgeLabel,
  ratesAreStale,
  type CountryPricing,
} from "@/lib/countryPricing";

export type CountryPricingRow = {
  code: string;
  enabled: boolean;
  markupPercent: number;
  unitsPerInr: number | null;
};

type Props = {
  rows: CountryPricingRow[];
  settings: { internationalEnabled: boolean; pickerEnabled: boolean; homeVisitOutsideIndia: boolean };
  /** The newest `rate_fetched_at` across the rows, or null if never. */
  ratesFetchedAt: string | null;
  /** Prices to preview the maths against: the active conditions. */
  samples: { id: string; title: string; pricePaise: number }[];
  /** Read-only for a desk that can see Catalog but not change it. */
  canManage: boolean;
  nowMs: number;
};

type Draft = { enabled: boolean; markup: string };
type Filter = "all" | "on" | "off";

/**
 * Catalog -> Countries & currency.
 *
 * One row per country: whether it sees its own currency, how much above the
 * Indian price it pays, and -- live, as the percentage is typed -- what that
 * does to a real price on the catalogue: the raised rupee figure, the
 * straight conversion, the .99 price the visitor will see, and the rupees
 * Razorpay will actually take. The worked example IS the explanation; the
 * screen does not need a paragraph about rounding.
 */
export default function AdminCountryPricingTab({ rows, settings, ratesFetchedAt, samples, canManage, nowMs }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);

  const [switches, setSwitches] = useState(settings);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sample = samples.find((s) => s.id === sampleId) ?? samples[0] ?? null;
  const stale = ratesAreStale(ratesFetchedAt, nowMs);

  function current(code: string): Draft {
    const saved = byCode.get(code);
    return drafts[code] ?? { enabled: saved?.enabled ?? false, markup: String(saved?.markupPercent ?? 0) };
  }

  function edit(code: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [code]: { ...current(code), ...patch } }));
  }

  const changedCodes = Object.keys(drafts).filter((code) => {
    const d = drafts[code];
    const saved = byCode.get(code);
    return d.enabled !== (saved?.enabled ?? false) || Number(d.markup) !== (saved?.markupPercent ?? 0);
  });
  const invalidCodes = changedCodes.filter((code) => !isValidMarkup(Number(drafts[code].markup)) || drafts[code].markup.trim() === "");

  const q = query.trim().toLowerCase();
  const visible = COUNTRIES.filter((c) => {
    if (q && !`${c.name} ${c.code} ${c.currency}`.toLowerCase().includes(q)) return false;
    const on = current(c.code).enabled;
    return filter === "all" || (filter === "on" ? on : !on);
  });
  const onCount = COUNTRIES.filter((c) => current(c.code).enabled).length;

  async function saveSwitch(key: keyof Props["settings"], value: boolean) {
    const before = switches;
    setSwitches({ ...switches, [key]: value });
    setError(null);
    const res = await fetch("/api/admin/country-pricing/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { [key]: value } }),
    }).catch(() => null);
    if (!res?.ok) {
      setSwitches(before);
      const data = res ? await res.json().catch(() => ({})) : {};
      setError(data.error ?? "Couldn't save that switch. Nothing changed.");
      return;
    }
    show("Saved.");
    router.refresh();
  }

  function saveRows() {
    if (invalidCodes.length > 0) {
      setError(`Each increase must be a number from 0 to ${MAX_MARKUP_PERCENT}%.`);
      return;
    }
    setError(null);
    startSaving(async () => {
      const res = await fetch("/api/admin/country-pricing/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: changedCodes.map((code) => ({
            code,
            enabled: drafts[code].enabled,
            markupPercent: Number(drafts[code].markup),
          })),
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        setError(data.error ?? "Couldn't save. Nothing changed.");
        return;
      }
      show(`Saved ${changedCodes.length} ${changedCodes.length === 1 ? "country" : "countries"}.`);
      setDrafts({});
      router.refresh();
    });
  }

  async function refreshRates() {
    setRefreshing(true);
    setError(null);
    const res = await fetch("/api/admin/country-pricing/refresh-rates", { method: "POST" }).catch(() => null);
    setRefreshing(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError(data.error ?? "Couldn't refresh the rates. The ones you had are still in use.");
      return;
    }
    show("Exchange rates updated.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-slate-800">Countries &amp; currency</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
          Visitors outside India can see prices in their own currency, raised by the percentage you
          set and rounded up to .99. Razorpay still charges in rupees - the exact rupee amount of the
          price they saw - so refunds, payouts and every report stay in INR. India always sees the
          prices you set in Catalog.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {(
            [
              ["internationalEnabled", "Local prices outside India", "Off: every visitor sees and pays rupees, as before."],
              ["pickerEnabled", "Visitors can change their country", "A country picker in the footer, for travellers and VPNs."],
              ["homeVisitOutsideIndia", "Home visits outside India", "Off: visitors outside India see no home visits at all."],
            ] as const
          ).map(([key, label, hint]) => (
            <div key={key} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={switches[key]}
                aria-label={label}
                disabled={!canManage}
                onClick={() => saveSwitch(key, !switches[key])}
                className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
                  switches[key] ? "bg-teal-700" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    switches[key] ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b px-6 py-4 ${
            stale ? "border-amber-200 bg-amber-50" : "border-slate-100"
          }`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              Exchange rates
              <span className={`ml-2 text-xs font-normal ${stale ? "text-amber-800" : "text-slate-500"}`}>
                {ratesFetchedAt ? `updated ${rateAgeLabel(ratesFetchedAt, nowMs)}` : "not fetched yet"}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500" title={ratesFetchedAt ? formatClinicDateTime(ratesFetchedAt) : undefined}>
              {stale
                ? "Refresh before switching a country on - prices use the rate stored here, never a live one."
                : "Prices use these stored rates until you refresh them, so a quote and its payment always agree."}
            </p>
          </div>
          <button
            type="button"
            onClick={refreshRates}
            disabled={!canManage || refreshing}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <i aria-hidden="true" className={`fa-solid fa-rotate ${refreshing ? "animate-spin" : ""}`}></i>
            {refreshing ? "Refreshing…" : "Refresh rates"}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <label className="min-w-[220px] flex-1">
            <span className="sr-only">Search countries</span>
            <span className="relative block">
              <i aria-hidden="true" className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a country or currency"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm"
              />
            </span>
          </label>
          <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Show">
            {(
              [
                ["all", `All ${COUNTRIES.length}`],
                ["on", `On ${onCount}`],
                ["off", `Off ${COUNTRIES.length - onCount}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  filter === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {samples.length > 0 && (
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Preview with</span>
              <select
                value={sample?.id ?? ""}
                onChange={(e) => setSampleId(e.target.value)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"
              >
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {formatInr(s.pricePaise)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="mx-6 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="hidden grid-cols-[minmax(0,1.6fr)_88px_120px_repeat(4,minmax(0,1fr))] gap-3 border-y border-slate-100 bg-slate-50 px-6 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 xl:grid">
          <span>Country</span>
          <span>Local price</span>
          <span>Increase by</span>
          <span>Indian price after</span>
          <span>Converted</span>
          <span>They see</span>
          <span>Razorpay charges</span>
        </div>

        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-3 text-sm text-slate-600">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">IN</span>
          <span className="font-semibold text-slate-800">India</span>
          <span className="text-xs text-slate-500">
            Always the Catalog price{sample ? `: ${formatInr(sample.pricePaise)}` : ""}, in rupees.
          </span>
        </div>

        <ul className="divide-y divide-slate-100">
          {visible.map((c) => {
            const d = current(c.code);
            const saved = byCode.get(c.code);
            const rate = saved?.unitsPerInr ?? null;
            const markupNumber = Number(d.markup);
            const markupOk = d.markup.trim() !== "" && isValidMarkup(markupNumber);
            const cfg: CountryPricing = {
              code: c.code,
              currency: c.currency,
              enabled: true,
              markupPercent: markupOk ? markupNumber : 0,
              unitsPerInr: rate,
            };
            const p = sample && rate ? priceForCountry(sample.pricePaise, cfg) : null;
            const changed = changedCodes.includes(c.code);
            return (
              <li
                key={c.code}
                className={`grid gap-3 px-6 py-3.5 xl:grid-cols-[minmax(0,1.6fr)_88px_120px_repeat(4,minmax(0,1fr))] xl:items-center ${
                  changed ? "bg-teal-50/50" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">{c.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">{c.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {c.currency} {currencySymbol(c.currency)}
                      {rate ? ` · ₹1 = ${rate.toPrecision(4)}` : " · no rate yet"}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 xl:hidden">Local price</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={d.enabled}
                    aria-label={`Local prices for ${c.name}`}
                    disabled={!canManage || (!rate && !d.enabled)}
                    title={!rate ? "Refresh the rates first" : undefined}
                    onClick={() => edit(c.code, { enabled: !d.enabled })}
                    className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50 ${
                      d.enabled ? "bg-teal-700" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        d.enabled ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                <label className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 xl:hidden">Increase by</span>
                  <span className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_MARKUP_PERCENT}
                      step={1}
                      value={d.markup}
                      disabled={!canManage}
                      onChange={(e) => edit(c.code, { markup: e.target.value })}
                      aria-label={`Increase for ${c.name}, percent`}
                      aria-invalid={!markupOk}
                      className={`h-10 w-24 rounded-lg border bg-white pl-3 pr-7 text-sm ${
                        markupOk ? "border-slate-300" : "border-red-400"
                      }`}
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span>
                  </span>
                </label>

                {p ? (
                  <>
                    <Figure label="Indian price after" value={formatInr(p.raisedPaise)} />
                    <Figure label="Converted" value={formatMinor(Math.round(p.convertedMinor), p.currency)} muted />
                    <Figure label="They see" value={formatMinor(p.displayMinor, p.currency)} strong />
                    <Figure label="Razorpay charges" value={formatInr(p.chargePaise)} muted />
                  </>
                ) : (
                  <p className="text-xs text-slate-500 xl:col-span-4">
                    {rate ? "Pick a price to preview." : "Refresh the rates to preview this country."}
                  </p>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-6 py-10 text-center text-sm text-slate-500">No country matches “{query}”.</li>
          )}
        </ul>
      </section>

      {changedCodes.length > 0 && canManage && (
        <div className="sticky bottom-[calc(1rem+var(--app-bottom-inset,0px))] z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-xl">
          <span className="text-sm font-semibold">
            {changedCodes.length} {changedCodes.length === 1 ? "country" : "countries"} changed
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDrafts({});
                setError(null);
              }}
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:text-white"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={saveRows}
              disabled={saving}
              className="min-h-10 rounded-xl bg-teal-500 px-4 text-sm font-bold text-teal-950 hover:bg-teal-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 xl:block">
      <span className="text-[11px] font-semibold text-slate-500 xl:hidden">{label}</span>
      <span
        className={`text-sm tabular-nums ${
          strong ? "font-display text-base font-bold text-teal-800" : muted ? "text-slate-500" : "font-semibold text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
