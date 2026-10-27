"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import type { WidgetGroup, WidgetSource } from "@/lib/profileWidgets";

/** One widget as the admin screens draw it (plain data from the server). */
export type WidgetRow = {
  key: string;
  label: string;
  description: string;
  group: WidgetGroup;
  parent: string | null;
  locked: boolean;
  lockedReason: string | null;
  /** What the patient's page does now. */
  visible: boolean;
  /** What the layer below would say (the condition kind's setting, or the
   *  code's default on the condition screen). */
  inherited: boolean;
  source: WidgetSource;
};

const GROUP_TITLE: Record<WidgetGroup, string> = {
  core: "Always on the page",
  picture: "The condition picture",
  records: "Records and history",
  graph_line: "Lines on the progress graph",
};
const GROUP_ORDER: WidgetGroup[] = ["core", "picture", "records", "graph_line"];

async function post(url: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 429) return "Too many changes at once - wait a moment and try again.";
    if (res.status === 403) return "Your access does not include this change.";
    return data?.error ?? "That didn't save. Please try again.";
  } catch {
    return "That didn't save - check your connection and try again.";
  }
}

function Switch({ on, disabled, label, onToggle }: { on: boolean; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
    >
      <span className={`relative inline-block h-6 w-11 rounded-full transition ${on ? "bg-teal-700" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function countText(rows: readonly WidgetRow[]) {
  const sections = rows.filter((r) => r.group !== "graph_line");
  return `${sections.filter((r) => r.visible).length} of ${sections.length} sections shown`;
}

function LockedNote({ row }: { row: WidgetRow }) {
  return (
    <span className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-600" title={row.lockedReason ?? undefined}>
      <i aria-hidden className="fa-solid fa-lock text-[11px]" />
      Always shown
    </span>
  );
}

/**
 * Settings -> Health Profile layout: per condition kind, every section with
 * a switch, and the live count. Locked sections show a lock and why. Drawn
 * only for a scope whose route accepts the change (Settings is Master Admin
 * only); an unreadable setting draws "we couldn't check" instead of switches,
 * because a row of switches would read as a fact.
 */
export function ProfileWidgetKindEditor({
  kinds,
}: {
  kinds: { kind: string; label: string; patientLabel: string; readable: boolean; rows: WidgetRow[] }[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [active, setActive] = useState(kinds[0]?.kind ?? "");
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = kinds.find((k) => k.kind === active) ?? kinds[0];

  const rows = useMemo(
    () =>
      (current?.rows ?? []).map((r) => {
        const o = overrides[`${current.kind}:${r.key}`];
        if (o === undefined || r.locked) return r;
        const visible = o === null ? r.inherited : o;
        return { ...r, visible, source: (o === null ? "default" : "kind") as WidgetSource };
      }),
    [current, overrides]
  );
  const parentHidden = (r: WidgetRow) => !!r.parent && rows.some((p) => p.key === r.parent && !p.visible);

  async function change(row: WidgetRow, visible: boolean | null) {
    if (!current) return;
    const id = `${current.kind}:${row.key}`;
    setError(null);
    setPending(id);
    setOverrides((o) => ({ ...o, [id]: visible }));
    const failed = await post("/api/admin/profile-widgets/kind", { profileKind: current.kind, widgetKey: row.key, visible });
    setPending(null);
    if (failed) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
      setError(failed);
      return;
    }
    show(visible === null ? `${row.label}: back to the default.` : `${row.label} ${visible ? "shown" : "hidden"} for every ${current.patientLabel.toLowerCase()} patient.`);
    router.refresh();
  }

  if (!current) return null;
  return (
    <div data-testid="profile-widget-kind-editor">
      <div role="tablist" aria-label="Condition type" className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={k.kind === current.kind}
            onClick={() => setActive(k.kind)}
            className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
              k.kind === current.kind ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-bold text-slate-900">
            {current.label} <span className="font-normal text-slate-600">({current.patientLabel})</span>
          </h3>
          {current.readable && (
            <p className="text-sm font-semibold text-slate-700" aria-live="polite" data-testid="profile-widget-count">
              {countText(rows)}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          What every patient of this type sees on their own Health Profile. Their physiotherapist still sees every section (hidden ones
          behind a &ldquo;hidden for this patient&rdquo; line), and you can change it for one patient on their record.
        </p>
        {!current.readable ? (
          <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            We couldn&apos;t check this setting just now, so patients see the standard layout until it loads. Refresh to try again.
          </p>
        ) : (
          GROUP_ORDER.map((group) => {
            const inGroup = rows.filter((r) => r.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className="mt-4">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">{GROUP_TITLE[group]}</h4>
                <ul className="mt-1 divide-y divide-slate-100">
                  {inGroup.map((r) => {
                    const id = `${current.kind}:${r.key}`;
                    return (
                      <li key={r.key} className="flex items-center justify-between gap-3 py-1.5" data-widget={r.key}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                          <p className="text-xs text-slate-600">
                            {r.locked ? r.lockedReason : r.description}
                            {!r.locked && r.source === "kind" && " · Set by the clinic"}
                            {parentHidden(r) && " · Hidden with the progress graph"}
                          </p>
                        </div>
                        {r.locked ? (
                          <LockedNote row={r} />
                        ) : (
                          <div className="flex items-center gap-1">
                            {r.source === "kind" && (
                              <button
                                type="button"
                                onClick={() => void change(r, null)}
                                disabled={pending === id}
                                className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                              >
                                Default
                              </button>
                            )}
                            <Switch on={r.visible} disabled={pending === id} label={`Show ${r.label}`} onToggle={() => void change(r, !r.visible)} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

const SOURCE_TEXT: Record<WidgetSource, string> = {
  locked: "Always shown",
  patient: "Set for this patient",
  kind: "Inherited from the condition type",
  default: "Inherited (standard)",
};

/**
 * The admin patient record -> "Sections for this patient": every section as
 * inherited / on / off, an override switch and "Reset to condition default".
 * The switches render only for a scope that manages People (the route's
 * gate); otherwise the list is read-only. An unreadable layer says so.
 */
export function ProfileWidgetPatientPanel({
  patientId,
  rows,
  canManage,
  kindUnreadable,
  patientUnreadable,
}: {
  patientId: string;
  rows: WidgetRow[];
  canManage: boolean;
  kindUnreadable: boolean;
  patientUnreadable: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [local, setLocal] = useState<Record<string, boolean | null>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const view = rows.map((r) => {
    const o = local[r.key];
    if (o === undefined || r.locked) return r;
    return { ...r, visible: o === null ? r.inherited : o, source: (o === null ? "kind" : "patient") as WidgetSource };
  });
  const sections = view.filter((r) => r.group !== "graph_line");
  const hidden = sections.filter((r) => !r.visible).length;

  async function change(row: WidgetRow, visible: boolean | null) {
    setError(null);
    setPending(row.key);
    setLocal((o) => ({ ...o, [row.key]: visible }));
    const failed = await post("/api/admin/profile-widgets/patient", { patientId, widgetKey: row.key, visible });
    setPending(null);
    if (failed) {
      setLocal((o) => {
        const next = { ...o };
        delete next[row.key];
        return next;
      });
      setError(failed);
      return;
    }
    show(visible === null ? `${row.label}: back to the condition default.` : `${row.label} ${visible ? "shown" : "hidden"} for this patient.`);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" data-testid="profile-widget-patient-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-800">Sections for this patient</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {sections.length - hidden} of {sections.length} sections shown on the patient&apos;s own Health Profile. Their physiotherapist sees
            every section.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          {open ? "Hide the list" : canManage ? "Choose sections" : "See the sections"}
        </button>
      </div>
      {(kindUnreadable || patientUnreadable) && (
        <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {patientUnreadable
            ? "We couldn't check this patient's own choices just now, so the list below shows the condition type's layout. Refresh to try again before changing anything."
            : "We couldn't check the condition type's layout just now, so \"inherited\" below means the standard layout. Refresh to try again."}
        </p>
      )}
      {open && (
        <ul className="mt-3 divide-y divide-slate-100">
          {view.map((r) => (
            <li key={r.key} className={`flex items-center justify-between gap-3 py-1.5 ${r.group === "graph_line" ? "pl-4" : ""}`} data-widget={r.key}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {r.group === "graph_line" ? `Graph line: ${r.label}` : r.label}
                </p>
                <p className="text-xs text-slate-600">
                  {r.locked ? r.lockedReason : `${SOURCE_TEXT[r.source]} · ${r.visible ? "On" : "Off"}`}
                </p>
              </div>
              {r.locked ? (
                <LockedNote row={r} />
              ) : canManage && !patientUnreadable ? (
                <div className="flex items-center gap-1">
                  {r.source === "patient" && (
                    <button
                      type="button"
                      onClick={() => void change(r, null)}
                      disabled={pending === r.key}
                      className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                    >
                      Reset to condition default
                    </button>
                  )}
                  <Switch on={r.visible} disabled={pending === r.key} label={`Show ${r.label} for this patient`} onToggle={() => void change(r, !r.visible)} />
                </div>
              ) : (
                <span className="text-xs font-semibold text-slate-700">{r.visible ? "On" : "Off"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
