"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard, { EmptyState, StatusPill } from "@/components/dashboard/SurfaceCard";
import { useConfirm } from "@/lib/useConfirm";
import {
  describePromoCode,
  isWellFormedPromoCode,
  normalizePromoCode,
  promoCodeState,
  type PromoCode,
  type PromoCodeKind,
} from "@/lib/promoCodes";

export type PromoCodeRow = PromoCode & {
  description: string | null;
  /** How many bookings have claimed it. A claimed code is never deleted --
   *  a paid session pointing at a campaign nobody can name cannot answer
   *  which rule gave the money away. */
  claims: number;
};

const STATE_LABEL = {
  running: "Running",
  scheduled: "Scheduled",
  ended: "Ended",
  paused: "Paused",
} as const;

const STATE_TONE = {
  running: "good",
  scheduled: "info",
  ended: "neutral",
  paused: "warn",
} as const;

function inputCls() {
  return "w-full p-2 rounded-lg border border-slate-300 text-xs";
}

function labelCls() {
  return "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";
}

/** A datetime-local field holds local wall-clock time with no zone; the
 *  route parses whatever this produces, so it is converted once, here. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours()
  )}:${pad(at.getMinutes())}`;
}

function CampaignForm({
  existing,
  onDone,
}: {
  existing: PromoCodeRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(existing?.code ?? "");
  const [kind, setKind] = useState<PromoCodeKind>(existing?.kind ?? "amount_off");
  // Rupees on screen, paise on the wire -- the admin types what a patient
  // would read off a poster.
  const [value, setValue] = useState(
    existing ? String(existing.kind === "percent_off" ? existing.value : existing.value / 100) : ""
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.endsAt ?? null));
  const [maxRedemptions, setMaxRedemptions] = useState(
    existing?.maxRedemptions === null || existing?.maxRedemptions === undefined
      ? ""
      : String(existing.maxRedemptions)
  );
  const [maxPerPatient, setMaxPerPatient] = useState(String(existing?.maxPerPatient ?? 1));
  const [minSpend, setMinSpend] = useState(
    existing?.minSpendPaise ? String(existing.minSpendPaise / 100) : ""
  );
  const [firstSessionOnly, setFirstSessionOnly] = useState(existing?.firstSessionOnly ?? false);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const normalized = normalizePromoCode(code);
  const codeLooksRight = isWellFormedPromoCode(normalized);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const numericValue = Number(value);
    const res = await fetch("/api/admin/save-promo-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existing?.id ?? null,
        code: normalized,
        kind,
        value: kind === "percent_off" ? Math.round(numericValue) : Math.round(numericValue * 100),
        active: existing ? existing.active : true,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        maxRedemptions: maxRedemptions.trim() === "" ? null : Number(maxRedemptions),
        maxPerPatient: Number(maxPerPatient) || 1,
        minSpendPaise: minSpend.trim() === "" ? 0 : Math.round(Number(minSpend) * 100),
        firstSessionOnly,
        description: description.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save that code.");
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls()} htmlFor="promo-code">
            Code
          </label>
          <input
            id="promo-code"
            className={inputCls()}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="WELCOME200"
            autoComplete="off"
          />
          {code.length > 0 && !codeLooksRight && (
            <p className="mt-1 text-[11px] text-amber-700">
              Letters and digits only, 3 to 24 of them.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls()} htmlFor="promo-kind">
            Takes off
          </label>
          <select
            id="promo-kind"
            className={inputCls()}
            value={kind}
            onChange={(e) => setKind(e.target.value as PromoCodeKind)}
          >
            <option value="amount_off">An amount</option>
            <option value="percent_off">A percentage</option>
          </select>
        </div>
        <div>
          <label className={labelCls()} htmlFor="promo-value">
            {kind === "percent_off" ? "Percent off" : "Rupees off"}
          </label>
          <input
            id="promo-value"
            className={inputCls()}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder={kind === "percent_off" ? "20" : "200"}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls()} htmlFor="promo-starts">
            Starts (optional)
          </label>
          <input
            id="promo-starts"
            type="datetime-local"
            className={inputCls()}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls()} htmlFor="promo-ends">
            Ends (optional)
          </label>
          <input
            id="promo-ends"
            type="datetime-local"
            className={inputCls()}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            The code stops working at this moment, so set it to the start of the day after the
            last day you want it live.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls()} htmlFor="promo-max">
            Total uses
          </label>
          <input
            id="promo-max"
            className={inputCls()}
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            inputMode="numeric"
            placeholder="Unlimited"
          />
        </div>
        <div>
          <label className={labelCls()} htmlFor="promo-per-patient">
            Uses per patient
          </label>
          <input
            id="promo-per-patient"
            className={inputCls()}
            value={maxPerPatient}
            onChange={(e) => setMaxPerPatient(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={labelCls()} htmlFor="promo-min-spend">
            Minimum spend (₹)
          </label>
          <input
            id="promo-min-spend"
            className={inputCls()}
            value={minSpend}
            onChange={(e) => setMinSpend(e.target.value)}
            inputMode="decimal"
            placeholder="None"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={firstSessionOnly}
          onChange={(e) => setFirstSessionOnly(e.target.checked)}
        />
        <span>
          First session only — a patient who has already paid for a session cannot use it.
        </span>
      </label>

      <div>
        <label className={labelCls()} htmlFor="promo-description">
          What this campaign is for (only you see this)
        </label>
        <input
          id="promo-description"
          className={inputCls()}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Diwali flyer, October"
        />
      </div>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !codeLooksRight}
          className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Save changes" : "Create code"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Campaigns, on the screen that already reports what discounting cost.
 *
 * Deliberately not a sidebar entry of its own: the figure and the rules that
 * produced it are one subject, and splitting them is how a reported number
 * stops being connected to anything anybody can change.
 */
export default function PromoCodeManager({
  codes,
  enabled,
  nowIso,
}: {
  codes: PromoCodeRow[];
  /** The master switch. With it off the checkout shows no code field at all,
   *  so a campaign here is inert -- said plainly rather than left for an
   *  admin to discover by testing a code that does nothing. */
  enabled: boolean;
  /** From the server, so the running/ended labels do not disagree with the
   *  HTML at hydration. */
  nowIso: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(enabled);
  const [switching, startSwitch] = useTransition();
  const now = new Date(nowIso);

  function toggleEnabled() {
    const next = !optimisticEnabled;
    setError(null);
    startSwitch(async () => {
      setOptimisticEnabled(next);
      try {
        await post("/api/admin/update-setting", { key: "promo_codes_enabled", value: next });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
  }

  async function toggleActive(row: PromoCodeRow) {
    setBusyId(row.id);
    setError(null);
    try {
      await post("/api/admin/save-promo-code", {
        id: row.id,
        code: row.code,
        kind: row.kind,
        value: row.value,
        active: !row.active,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        maxRedemptions: row.maxRedemptions,
        maxPerPatient: row.maxPerPatient,
        minSpendPaise: row.minSpendPaise,
        firstSessionOnly: row.firstSessionOnly,
        description: row.description,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: PromoCodeRow) {
    const ok = await confirm(
      `Delete ${row.code}? Nobody has used it, so there is nothing to keep a record of.`
    );
    if (!ok) return;
    setBusyId(row.id);
    setError(null);
    try {
      await post("/api/admin/delete-promo-code", { id: row.id });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SurfaceCard
      title="Promo codes"
      icon="fa-ticket"
      subtitle="A campaign a patient can type at checkout. The code names the rule; every figure comes from here."
      actions={
        <div className="flex items-center gap-2">
          {/* The switch sits beside the campaigns it governs rather than two
              screens away in Settings: an admin who has just written a code
              and cannot see why it does nothing is the whole failure this
              placement avoids. */}
          <button
            type="button"
            onClick={toggleEnabled}
            disabled={switching}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-60 ${
              optimisticEnabled
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "bg-slate-200 text-slate-800 hover:bg-slate-300"
            }`}
          >
            {optimisticEnabled ? "Codes on" : "Codes off"}
          </button>
          {!creating && !editingId && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              New code
            </button>
          )}
        </div>
      }
    >
      {!optimisticEnabled && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Promo codes are switched off, so checkout shows no code field and none of these can be
          used. Switching them on does not start a campaign — each code still has its own dates
          and its own switch.
        </p>
      )}

      {error && <p className="mb-3 text-xs font-semibold text-red-600">{error}</p>}

      {creating && <CampaignForm existing={null} onDone={() => setCreating(false)} />}

      {codes.length === 0 && !creating ? (
        <EmptyState
          icon="fa-ticket"
          title="No codes yet"
          body="Create one when you have a campaign to run. A coupon with nothing behind it is a box that teaches patients to go looking for a discount."
        />
      ) : (
        <ul className="mt-3 space-y-3">
          {codes.map((row) =>
            editingId === row.id ? (
              <li key={row.id}>
                <CampaignForm existing={row} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">{row.code}</span>
                    <StatusPill tone={STATE_TONE[promoCodeState(row, now)]}>
                      {STATE_LABEL[promoCodeState(row, now)]}
                    </StatusPill>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {describePromoCode(row)} · claimed {row.claims}
                    {row.maxRedemptions !== null ? ` of ${row.maxRedemptions}` : ""}
                  </p>
                  {row.description && (
                    <p className="mt-0.5 text-[11px] text-slate-500">{row.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(row.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => toggleActive(row)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                  >
                    {row.active ? "Pause" : "Resume"}
                  </button>
                  {row.claims === 0 && (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => remove(row)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}
      {dialog}
    </SurfaceCard>
  );
}
