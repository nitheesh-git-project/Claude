"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { formatInr } from "@/lib/formatMoney";
import { adminScreenHref } from "@/lib/adminNav";
import AdminScreenLink from "@/components/admin/AdminScreenLink";
import FilterChips from "@/components/dashboard/FilterChips";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import {
  homeVisitPriceListing,
  parseRupeesToPaise,
  type HomeVisitPriceLine,
  type HomeVisitPriceRow,
} from "@/lib/homeVisitRates";

// Catalog -> Conditions -> Home visits.
//
// One clinic-wide price for a home visit, and any condition may set its own
// instead. One visit each: there is no visit count, no validity and no days
// to set, because a course of visits is something a therapist recommends
// after seeing the patient -- at exactly these prices. Travel is added per
// visit from Service Areas.
//
// Everything saves through /api/admin/set-home-visit-price, which re-reads
// the rows and decides the row itself; this screen sends a condition and a
// figure in paise, never a row id to overwrite.

type Filter = "all" | "own" | "clinic";

const BUTTON =
  "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500";

export default function HomeVisitPriceList({
  priceRows,
  conditions,
  homeVisitEnabled,
  canManage,
}: {
  /** The current price rows (active, one visit, not a course). */
  priceRows: HomeVisitPriceRow[];
  /** Every active condition, in display order. */
  conditions: { id: string; title: string }[];
  homeVisitEnabled: boolean;
  /** The viewer's scope can write Catalog. Without it nothing here offers
   *  a control the route would refuse. */
  canManage: boolean;
}) {
  const { clinicWide, lines } = useMemo(
    () => homeVisitPriceListing(priceRows, conditions),
    [priceRows, conditions]
  );
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = lines.filter((l) =>
    filter === "own" ? l.own !== null : filter === "clinic" ? l.own === null : true
  );
  const { rows: page, pager } = usePagedList(filtered, { storageKey: "catalog-home-visit-prices" });
  const ownCount = lines.filter((l) => l.own !== null).length;

  return (
    <div className="space-y-5">
      {!homeVisitEnabled && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <i aria-hidden className="fa-solid fa-triangle-exclamation mr-1.5" />
          {"Home visits are switched off, so none of these prices is on sale. Turn them on under "}
          <AdminScreenLink
            href={adminScreenHref("settings", "programmes")}
            className="font-semibold text-amber-900 underline"
          >
            Settings → Programmes &amp; Home Visits
          </AdminScreenLink>
          .
        </p>
      )}

      <ClinicWideRow clinicWide={clinicWide} canManage={canManage} />

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800">By condition</h4>
          {lines.length > 0 && (
            <FilterChips
              label="Filter home-visit prices"
              value={filter}
              onChange={setFilter}
              className="mb-0"
              choices={[
                { key: "all", label: "All", count: lines.length },
                { key: "own", label: "Own price", count: ownCount },
                { key: "clinic", label: "Clinic-wide", count: lines.length - ownCount },
              ]}
            />
          )}
        </div>
        {lines.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            No condition is on sale. Turn one on under Online sessions above and it appears here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            {filter === "own"
              ? "Every condition uses the clinic-wide price."
              : "Every condition has its own price."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="home-visit-price-lines">
            {page.map((line) => (
              <ConditionLine
                key={line.categoryId}
                line={line}
                clinicWidePaise={clinicWide?.pricePaise ?? null}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
        {filtered.length > 0 && (
          <ListPager pager={pager} noun="condition" className="mt-3" />
        )}
      </div>

      <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
        {"Travel is added per visit from "}
        <AdminScreenLink
          href={adminScreenHref("catalog", "areas")}
          className="font-semibold text-teal-700 hover:underline"
        >
          Service Areas
        </AdminScreenLink>
        {". Hands-on recommendations use these prices. A new price reaches new bookings only - what a patient already bought keeps the price they paid."}
      </p>
    </div>
  );
}

/** Posts one change and reports it. The control is busy for its own request
 *  only; the refresh after it is the page bar's to show. */
function useSavePrice() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function save(
    body: Record<string, unknown>,
    success: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (inFlight.current) return { ok: false, error: "Still saving the last change." };
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/set-home-visit-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Couldn't save the price. Nothing has changed." };
      }
      toast.show(data.warning ?? success, data.warning ? "info" : "success");
      router.refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Couldn't reach the server. Nothing has changed." };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { save, busy };
}

function ClinicWideRow({
  clinicWide,
  canManage,
}: {
  clinicWide: ReturnType<typeof homeVisitPriceListing>["clinicWide"];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(clinicWide === null && canManage);
  const [price, setPrice] = useState(clinicWide ? String(clinicWide.pricePaise / 100) : "");
  const [minutes, setMinutes] = useState(String(clinicWide?.durationMinutes ?? 60));
  const [error, setError] = useState<string | null>(null);
  const { save, busy } = useSavePrice();
  const priceId = useId();
  const minutesId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const pricePaise = parseRupeesToPaise(price);
    if (pricePaise === null) {
      setError("Enter the price in rupees, for example 1500.");
      return;
    }
    const durationMinutes = Number(minutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
      setError("A visit lasts between 15 and 480 minutes.");
      return;
    }
    const result = await save(
      { categoryId: null, pricePaise, durationMinutes },
      `The clinic-wide home-visit price is now ${formatInr(pricePaise)} for ${durationMinutes} minutes`
    );
    if (result.ok) setEditing(false);
    else setError(result.error);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4" data-testid="home-visit-clinic-wide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Clinic-wide price</p>
          <p className="mt-0.5 text-xs text-slate-600">
            What one home visit costs for every condition without its own price.
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-3">
            <p className="text-right">
              <span className="font-display text-lg font-extrabold text-slate-900">
                {clinicWide ? formatInr(clinicWide.pricePaise) : "Not set"}
              </span>
              {clinicWide && (
                <span className="block text-[11px] text-slate-500">
                  {`one visit · ${clinicWide.durationMinutes} min`}
                  {clinicWide.travelFeeIncluded ? " · travel included" : ""}
                </span>
              )}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setPrice(clinicWide ? String(clinicWide.pricePaise / 100) : "");
                  setMinutes(String(clinicWide?.durationMinutes ?? 60));
                  setError(null);
                  setEditing(true);
                }}
                className={`${BUTTON} border border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-800`}
              >
                {clinicWide ? "Edit" : "Set price"}
              </button>
            )}
          </div>
        )}
      </div>

      {!clinicWide && !editing && (
        <p className="mt-2 text-xs text-amber-800">
          {"No clinic-wide price yet, so only conditions with their own price can be booked at home."}
        </p>
      )}

      {editing && canManage && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <label htmlFor={priceId} className="text-xs font-semibold text-slate-700">
            Price (₹)
            <input
              id={priceId}
              type="number"
              inputMode="decimal"
              min={1}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label htmlFor={minutesId} className="text-xs font-semibold text-slate-700">
            Visit length (min)
            <input
              id={minutesId}
              type="number"
              inputMode="numeric"
              min={15}
              max={480}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 block w-28 rounded-lg border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <button type="submit" disabled={busy} className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800`}>
            {busy ? "Saving..." : "Save"}
          </button>
          {clinicWide && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className={`${BUTTON} text-slate-600 hover:bg-slate-100`}
            >
              Cancel
            </button>
          )}
          <p className="basis-full text-[11px] text-slate-500">
            {"The visit length applies to every condition, including those with their own price."}
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function ConditionLine({
  line,
  clinicWidePaise,
  canManage,
}: {
  line: HomeVisitPriceLine;
  clinicWidePaise: number | null;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { save, busy } = useSavePrice();
  const priceId = useId();

  function startEditing() {
    setPrice(
      line.own
        ? String(line.own.pricePaise / 100)
        : clinicWidePaise !== null
          ? String(clinicWidePaise / 100)
          : ""
    );
    setError(null);
    setEditing(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const pricePaise = parseRupeesToPaise(price);
    if (pricePaise === null) {
      setError("Enter the price in rupees, for example 1800.");
      return;
    }
    const result = await save(
      { categoryId: line.categoryId, pricePaise },
      `${line.title} now has its own home-visit price: ${formatInr(pricePaise)}`
    );
    if (result.ok) setEditing(false);
    else setError(result.error);
  }

  async function useClinicWide() {
    setError(null);
    const result = await save(
      { categoryId: line.categoryId, useClinicWide: true },
      clinicWidePaise !== null
        ? `${line.title} now uses the clinic-wide home-visit price: ${formatInr(clinicWidePaise)}`
        : `${line.title} no longer has its own home-visit price`
    );
    if (!result.ok) setError(result.error);
  }

  return (
    <li className="px-4 py-3" data-testid="home-visit-price-line" data-category-id={line.categoryId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-slate-800">{line.title}</p>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            {line.own ? (
              <span className="text-sm font-bold text-slate-900">
                {formatInr(line.own.pricePaise)}{" "}
                <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  own price
                </span>
              </span>
            ) : clinicWidePaise !== null ? (
              <span className="text-sm text-slate-500">{`Clinic-wide (${formatInr(clinicWidePaise)})`}</span>
            ) : (
              <span className="text-xs text-amber-700">Not on sale - no price set</span>
            )}
            {canManage &&
              (line.own ? (
                <>
                  <button
                    type="button"
                    onClick={startEditing}
                    disabled={busy}
                    aria-label={`Edit the home-visit price for ${line.title}`}
                    className={`${BUTTON} border border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-800`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={useClinicWide}
                    disabled={busy}
                    aria-label={`Use the clinic-wide home-visit price for ${line.title}`}
                    className={`${BUTTON} text-slate-600 hover:bg-slate-100`}
                  >
                    {busy ? "Saving..." : "Use clinic-wide"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  aria-label={`Set an own home-visit price for ${line.title}`}
                  className={`${BUTTON} border border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-800`}
                >
                  Set own price
                </button>
              ))}
          </div>
        )}
      </div>

      {editing && canManage && (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
          <label htmlFor={priceId} className="text-xs font-semibold text-slate-700">
            {`Own price for ${line.title} (₹)`}
            <input
              id={priceId}
              type="number"
              inputMode="decimal"
              min={1}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <button type="submit" disabled={busy} className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800`}>
            {busy ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className={`${BUTTON} text-slate-600 hover:bg-slate-100`}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}
