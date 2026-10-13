"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/useRouter";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import ListPager from "@/components/dashboard/ListPager";
import DataExportButtons from "@/components/admin/DataExportButtons";
import DateField from "@/components/system/DateField";
import OverlayPortal from "@/components/system/OverlayPortal";
import ProgrammeIdChip from "@/components/dashboard/ProgrammeIdChip";
import PackagePurchaseDetailModal from "@/components/admin/PackagePurchaseDetailModal";
import HomeVisitPurchaseDetailModal from "@/components/admin/HomeVisitPurchaseDetailModal";
import { usePagedList } from "@/lib/usePagedList";
import { rowActivationProps } from "@/lib/rowActivation";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { adminScreenHref } from "@/lib/adminNav";
import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";
import { formatRupees } from "@/lib/formatMoney";
import { programmeProgress } from "@/lib/programmeId";
import type { CsvColumn } from "@/lib/csvExport";
import {
  CLOSED_STAGES,
  EMPTY_PROGRAMME_FILTERS,
  PIPELINE_STAGES,
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_TONE,
  countStages,
  filterProgrammes,
  filterProgrammesExceptStage,
  filtersFromView,
  hasProgrammeFilters,
  parseProgrammeFilters,
  writeProgrammeFilters,
  type ProgrammeEventKind,
  type ProgrammeFilters,
  type ProgrammeRow,
  type ProgrammeStage,
} from "@/lib/programmePipeline";

const MIN_REASON = 10;

function inr(paise: number | null | undefined): string {
  return typeof paise === "number" ? `₹${formatRupees(paise)}` : "-";
}

function StagePill({ stage }: { stage: ProgrammeStage }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${STAGE_TONE[stage]}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

function ModeBadge({ mode }: { mode: ProgrammeRow["mode"] }) {
  return mode === "home_visit" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
      <i aria-hidden="true" className="fa-solid fa-house-medical" /> Home visit
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
      <i aria-hidden="true" className="fa-solid fa-video" /> Video
    </span>
  );
}

/** The programme's ID and progress, or a plain line while it has none. */
function IdCell({ row, size = "sm" }: { row: ProgrammeRow; size?: "xs" | "sm" | "md" }) {
  if (!row.code && row.display === "No ID yet") {
    return <span className="text-[11px] font-semibold text-slate-500">No ID yet</span>;
  }
  return <ProgrammeIdChip tag={{ code: row.code ?? row.display.split("-")[0], done: row.done, total: row.total }} size={size} />;
}

/**
 * Programmes -> All Programmes.
 *
 * Every programme -- recommended, paid for, under way, finished or stopped,
 * online or at home -- as one list, with the pipeline that says where they
 * all are above it. One row is one programme from the therapist's
 * recommendation to its last session, under one ID (PED_PKG001) whose
 * "-2/6" is sessions completed over sessions bought. The stage on each row
 * is decided once, in src/lib/programmePipeline.ts, so the counts, the
 * pills and the filters agree.
 *
 * Filters live in the URL (pg_* keys) so a filtered list can be shared,
 * and a count on another screen links to the rows it counted through the
 * usual one-shot `?view=` preset.
 */
export default function AdminProgrammesTab({
  rows,
  conditions,
  therapists,
  allTherapists,
  canManage,
  canSeeMoney,
  failed,
  loadFailed,
  idsMissing,
  nowMs,
}: {
  rows: ProgrammeRow[];
  conditions: { id: string; title: string }[];
  therapists: { id: string; name: string }[];
  /** Everyone a programme can be moved to, for the purchase controls. */
  allTherapists: { id: string; full_name: string }[];
  /** Programmes at `manage`: the decision and purchase controls render. */
  canManage: boolean;
  /** Money's own scope: amounts, discounts and the refund button. */
  canSeeMoney: boolean;
  /** Reads that failed, in words. */
  failed: string[];
  /** The whole read failed: nothing below can be trusted as complete. */
  loadFailed: boolean;
  /** The database has no programme IDs yet (schema.sql not applied). */
  idsMissing: boolean;
  /** Resolved on the server, like every clock reading on this dashboard. */
  nowMs: number;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filters, setFilters] = useState<ProgrammeFilters>(() => parseProgrammeFilters(searchParams));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [managing, setManaging] = useState<{ id: string; kind: "package" | "home_visit"; returnKey: string } | null>(null);

  // The `?view=` preset, applied during render (every admin screen is
  // mounted at once, so there is no mount to hang it on) -- the same rule
  // as All Sessions. It replaces every filter: a remembered condition would
  // hide rows the count that linked here included.
  const viewParam = searchParams.get("view");
  const [appliedView, setAppliedView] = useState<string | null>(null);
  if (viewParam !== appliedView) {
    setAppliedView(viewParam);
    const preset = filtersFromView(viewParam);
    if (preset) setFilters(preset);
  }

  // Keep the URL in step while this screen is the one on show, so the
  // address bar is always a link to what is on screen. replaceState: a
  // keystroke in the search box is not a step Back should walk through.
  const onThisScreen = searchParams.get("section") === "programmes" && (searchParams.get("tab") ?? "all") === "all";
  useEffect(() => {
    if (!onThisScreen) return;
    const params = new URLSearchParams(window.location.search);
    const before = params.toString();
    writeProgrammeFilters(params, filters);
    const after = params.toString();
    if (after !== before) window.history.replaceState(null, "", `${window.location.pathname}?${after}`);
  }, [filters, onThisScreen]);

  const set = <K extends keyof ProgrammeFilters>(key: K, value: ProgrammeFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const counts = useMemo(() => countStages(filterProgrammesExceptStage(rows, filters, nowMs)), [rows, filters, nowMs]);
  const filtered = useMemo(() => filterProgrammes(rows, filters, nowMs), [rows, filters, nowMs]);
  const { rows: visible, pager } = usePagedList(filtered, {
    storageKey: "admin-programmes",
    defaultPageSize: 25,
    resetKey: JSON.stringify(filters),
  });
  const open = openKey ? rows.find((r) => r.key === openKey) ?? null : null;
  const openTotal = PIPELINE_STAGES.reduce((n, s) => n + counts[s], 0);

  const exportColumns: CsvColumn<ProgrammeRow>[] = [
    { header: "Programme ID", value: (r) => r.display },
    { header: "Old code", value: (r) => r.otherCodes.join(" ") },
    { header: "Condition", value: (r) => r.conditionTitle },
    { header: "Mode", value: (r) => (r.mode === "home_visit" ? "Home visit" : "Video") },
    { header: "Patient", value: (r) => r.patientName },
    { header: "Therapist", value: (r) => r.therapistName ?? "" },
    { header: "Status", value: (r) => STAGE_LABEL[r.stage] },
    { header: "Done", value: (r) => r.done },
    { header: "Booked", value: (r) => r.booked },
    { header: "Total", value: (r) => r.total },
    { header: "Started", value: (r) => formatClinicDate(r.createdAt) },
    { header: "Paid on", value: (r) => (r.paidAt ? formatClinicDate(r.paidAt) : "") },
    { header: "Expires", value: (r) => (r.expiresAt ? formatClinicDate(r.expiresAt) : "") },
    { header: "Next session", value: (r) => (r.nextSession ? formatClinicDateTime(r.nextSession.slotTime) : "") },
    // The money group follows Money's scope exactly as the screen does: a
    // desk that cannot read the amount on screen cannot download it.
    ...(canSeeMoney
      ? ([
          { header: "List price (INR)", value: (r) => (r.money?.listPricePaise != null ? (r.money.listPricePaise / 100).toFixed(2) : "") },
          { header: "Discount (INR)", value: (r) => (r.money ? (r.money.discountPaise / 100).toFixed(2) : "") },
          { header: "Promo code", value: (r) => r.money?.promoCode ?? "" },
          { header: "Paid (INR)", value: (r) => (r.money?.paidPaise != null ? (r.money.paidPaise / 100).toFixed(2) : "") },
          { header: "Refunded (INR)", value: (r) => (r.money?.refundPaise != null ? (r.money.refundPaise / 100).toFixed(2) : "") },
        ] as CsvColumn<ProgrammeRow>[])
      : []),
  ];

  if (loadFailed) {
    return (
      <SurfaceCard title="Programmes" icon="fa-layer-group">
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-bold">{"Programmes couldn't be loaded just now."}</p>
          <p className="mt-1 text-xs">
            Nothing has changed - this is a read that failed, not an empty list. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-3 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
          >
            Try again
          </button>
        </div>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-6">
      {(failed.length > 0 || idsMissing) && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {failed.length > 0 && (
            <p>
              <span className="font-bold">Some of this is missing:</span> {"couldn't load "}
              {failed.join(", ")}. The list below may be incomplete - refresh to try again.
            </p>
          )}
          {idsMissing && (
            <p className={failed.length > 0 ? "mt-1" : ""}>
              <span className="font-bold">Programme IDs are not set up on this database yet,</span> so rows show
              their old SP/HS codes. They appear once the latest database update is applied.
            </p>
          )}
        </div>
      )}

      {/* The pipeline: where every programme is, in the order they move.
          Counted over every filter but the stage, so tapping a stage never
          lands on an empty list, and tapping it again shows them all. */}
      <SurfaceCard
        title="Where every programme is"
        icon="fa-route"
        subtitle="Tap a stage to list only those programmes. Tap it again to show them all."
      >
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE_STAGES.map((stage, i) => {
            const selected = filters.stage === stage;
            return (
              <li key={stage} className="relative">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set("stage", selected ? "" : stage)}
                  className={`flex h-full w-full flex-col rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                    selected ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] text-slate-700">{i + 1}</span>
                    {STAGE_LABEL[stage]}
                  </span>
                  <span className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{counts[stage]}</span>
                  <span className="mt-1 text-[11px] leading-snug text-slate-600">{STAGE_HINT[stage]}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold text-slate-500">Stopped:</span>
          {CLOSED_STAGES.map((stage) => {
            const selected = filters.stage === stage;
            return (
              <button
                key={stage}
                type="button"
                aria-pressed={selected}
                title={STAGE_HINT[stage]}
                onClick={() => set("stage", selected ? "" : stage)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                  selected ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {STAGE_LABEL[stage]} <span className="tabular-nums">{counts[stage]}</span>
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={filters.stage === "open"}
            onClick={() => set("stage", filters.stage === "open" ? "" : "open")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
              filters.stage === "open" ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-teal-800 ring-teal-200 hover:bg-teal-50"
            }`}
          >
            Not finished <span className="tabular-nums">{openTotal}</span>
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="All programmes"
        icon="fa-layer-group"
        subtitle={`${filtered.length} of ${rows.length}. The ID reads done/bought: PED_PKG001-2/6 is 2 of 6 sessions done. Tap a row for its full story.`}
        actions={
          <DataExportButtons
            filename="programmes"
            title="Programmes"
            subtitle="Every programme passing the filters in view."
            rows={filtered}
            columns={exportColumns}
          />
        }
      >
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Search programmes"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Programme ID, old code, patient, therapist or session ID"
              className="min-w-0 flex-1 basis-64 rounded-lg border border-slate-300 bg-white p-2 text-xs"
            />
            <select
              aria-label="Filter by status"
              value={filters.stage}
              onChange={(e) => set("stage", e.target.value as ProgrammeFilters["stage"])}
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="">Any status</option>
              <option value="open">Not finished</option>
              {[...PIPELINE_STAGES, ...CLOSED_STAGES].map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by condition"
              value={filters.condition}
              onChange={(e) => set("condition", e.target.value)}
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="">Any condition</option>
              {conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by therapist"
              value={filters.therapist}
              onChange={(e) => set("therapist", e.target.value)}
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="">Any therapist</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by mode"
              value={filters.mode}
              onChange={(e) => set("mode", e.target.value as ProgrammeFilters["mode"])}
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="">Video and home visit</option>
              <option value="online">Video sessions</option>
              <option value="home_visit">Home visits</option>
            </select>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              Started from
              <DateField value={filters.from} onChange={(v) => set("from", v)} ariaLabel="Started from" className="w-36" />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              to
              <DateField value={filters.to} onChange={(v) => set("to", v)} ariaLabel="Started to" className="w-36" />
            </div>
            {filters.late && (
              <button
                type="button"
                onClick={() => set("late", "")}
                className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
              >
                Paid over {Number(filters.late) >= 48 && Number(filters.late) % 24 === 0 ? `${Number(filters.late) / 24} days` : `${filters.late} hours`} ago
                <span aria-hidden="true">×</span>
                <span className="sr-only">- remove this filter</span>
              </button>
            )}
            {hasProgrammeFilters(filters) && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_PROGRAMME_FILTERS)}
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon="fa-layer-group"
            title="No programmes yet"
            body="When a therapist recommends a programme after a session, it appears here - first waiting for your approval, then with the patient, then as sessions are booked and done."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="fa-filter"
            title="No programme matches these filters"
            body="Try a shorter search, or clear the filters to see every programme."
            action={
              <button
                type="button"
                onClick={() => setFilters(EMPTY_PROGRAMME_FILTERS)}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(11rem,1.3fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_minmax(8rem,0.9fr)_minmax(9rem,1fr)] gap-3 border-b border-slate-200 px-3 pb-2 text-[11px] font-semibold text-slate-500 xl:grid"
            >
              <span>Programme</span>
              <span>Patient</span>
              <span>Therapist</span>
              <span>Status</span>
              <span>{canSeeMoney ? "Paid" : "Bought"}</span>
              <span>Dates</span>
            </div>
            <ul className="divide-y divide-slate-100" aria-label="Programmes">
              {visible.map((row) => (
                <ProgrammeListRow key={row.key} row={row} canSeeMoney={canSeeMoney} onOpen={() => setOpenKey(row.key)} />
              ))}
            </ul>
            <ListPager pager={pager} noun="programme" />
          </>
        )}
      </SurfaceCard>

      {open && (
        <ProgrammeDrawer
          key={open.key}
          row={open}
          canManage={canManage}
          canSeeMoney={canSeeMoney}
          onClose={() => setOpenKey(null)}
          onManagePurchase={() => {
            if (!open.purchaseId || !open.purchaseKind) return;
            setManaging({ id: open.purchaseId, kind: open.purchaseKind, returnKey: open.key });
            setOpenKey(null);
          }}
        />
      )}

      {managing &&
        (managing.kind === "package" ? (
          <PackagePurchaseDetailModal
            key={managing.id}
            purchaseId={managing.id}
            therapists={allTherapists}
            canSeeMoney={canSeeMoney}
            onClose={() => {
              setOpenKey(managing.returnKey);
              setManaging(null);
            }}
          />
        ) : (
          <HomeVisitPurchaseDetailModal
            key={managing.id}
            purchaseId={managing.id}
            therapists={allTherapists}
            canSeeMoney={canSeeMoney}
            onClose={() => {
              setOpenKey(managing.returnKey);
              setManaging(null);
            }}
          />
        ))}
    </div>
  );
}

function ProgrammeListRow({ row, canSeeMoney, onOpen }: { row: ProgrammeRow; canSeeMoney: boolean; onOpen: () => void }) {
  const p = programmeProgress(row.done, row.total);
  const toBook = Math.max(0, row.total - row.done - row.booked);
  return (
    <li
      {...rowActivationProps(onOpen)}
      data-programme-row={row.code ?? row.key}
      className="grid cursor-pointer grid-cols-1 gap-2 rounded-lg px-3 py-3 text-xs transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600 sm:grid-cols-2 xl:grid-cols-[minmax(11rem,1.3fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_minmax(8rem,0.9fr)_minmax(9rem,1fr)] xl:gap-3"
    >
      <div className="min-w-0">
        <IdCell row={row} />
        <p className="mt-1 font-semibold text-slate-800 [overflow-wrap:anywhere]">{row.conditionTitle}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <ModeBadge mode={row.mode} />
          <span>
            {p.label}
            {row.booked > 0 && ` · ${row.booked} booked`}
            {toBook > 0 && row.purchaseId && ` · ${toBook} to book`}
          </span>
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Patient</p>
        <p className="font-bold text-slate-900 [overflow-wrap:anywhere]">{row.patientName}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Therapist</p>
        <p className="text-slate-700 [overflow-wrap:anywhere]">{row.therapistName ?? "Not chosen yet"}</p>
        {row.nextSession && (
          <p className="mt-0.5 text-[11px] text-slate-500">
            Next: {formatClinicDateTime(row.nextSession.slotTime)}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <StagePill stage={row.stage} />
      </div>
      <div className="min-w-0 tabular-nums">
        {canSeeMoney && row.money ? (
          <>
            <p className="font-semibold text-slate-800">
              {row.money.paidPaise != null ? inr(row.money.paidPaise) : `${inr(row.money.listPricePaise)} offered`}
            </p>
            {row.money.discountPaise > 0 && (
              <p className="text-[11px] text-emerald-700">
                {inr(row.money.discountPaise)} off{row.money.promoCode ? ` with ${row.money.promoCode}` : ""}
              </p>
            )}
            {row.money.refundPaise != null && row.money.refundPaise > 0 && (
              <p className="text-[11px] text-violet-700">{inr(row.money.refundPaise)} refunded</p>
            )}
          </>
        ) : (
          <p className="text-slate-700">
            {row.total} {row.mode === "home_visit" ? "visits" : "sessions"}
          </p>
        )}
      </div>
      <div className="min-w-0 text-[11px] text-slate-600">
        <p>Started {formatClinicDate(row.createdAt)}</p>
        {row.paidAt && <p>Paid {formatClinicDate(row.paidAt)}</p>}
        {row.expiresAt && (
          <p>
            {row.purchaseId ? "Expires" : "Offer ends"} {formatClinicDate(row.expiresAt)}
          </p>
        )}
      </div>
    </li>
  );
}

const EVENT_ICON: Record<ProgrammeEventKind, string> = {
  written: "fa-pen",
  rewritten: "fa-pen-to-square",
  approved: "fa-circle-check",
  rejected: "fa-circle-xmark",
  sent: "fa-paper-plane",
  accepted: "fa-handshake",
  declined: "fa-hand",
  withdrawn: "fa-rotate-left",
  lapsed: "fa-hourglass-end",
  paid: "fa-indian-rupee-sign",
  booked: "fa-calendar-plus",
  completed_session: "fa-check-double",
  expired: "fa-calendar-xmark",
  refunded: "fa-money-bill-transfer",
};

const SESSION_STATUS: Record<string, string> = {
  requested: "Waiting for a therapist",
  confirmed: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
};

function ProgrammeDrawer({
  row,
  canManage,
  canSeeMoney,
  onClose,
  onManagePurchase,
}: {
  row: ProgrammeRow;
  canManage: boolean;
  canSeeMoney: boolean;
  onClose: () => void;
  onManagePurchase: () => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId });
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject" | "withdraw" | "refund">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const p = programmeProgress(row.done, row.total);
  const toBook = Math.max(0, row.total - row.done - row.booked);

  // Same as the session drawer: leaving the screen closes it, so a link out
  // never changes the page underneath while this stays on top.
  const searchParams = useSearchParams();
  const screenKey = `${searchParams.get("section") ?? ""}|${searchParams.get("tab") ?? ""}`;
  const [openedOn] = useState(screenKey);
  useEffect(() => {
    if (screenKey !== openedOn) onClose();
  }, [screenKey, openedOn, onClose]);

  async function post(url: string, body: Record<string, unknown>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    let ok = false;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      ok = res.ok;
      if (!ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That didn't go through. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
    if (ok) {
      setMode("idle");
      setReason("");
      router.refresh();
    }
  }

  const reasonShort = reason.trim().length < MIN_REASON;
  // What the refund routes accept: an active, prepaid, paid programme.
  const canRefund =
    canSeeMoney &&
    !!row.purchaseId &&
    (row.stage === "paid_unbooked" || row.stage === "in_progress") &&
    row.paymentMode !== "cash_on_visit" &&
    row.money?.paidPaise != null;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <div
          ref={panelRef}
          {...dialogProps}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white p-5 text-xs shadow-xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Programme</p>
              <h3 id={titleId} className="mt-0.5 font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
                {row.conditionTitle}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <IdCell row={row} size="md" />
                <StagePill stage={row.stage} />
                <ModeBadge mode={row.mode} />
              </div>
              {row.otherCodes.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Also found by: <span className="font-mono">{row.otherCodes.join(", ")}</span>
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-slate-500 hover:text-slate-700">
              {"×"}
            </button>
          </div>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{STAGE_HINT[row.stage]}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[11px] font-semibold text-slate-500">Patient</dt>
              <dd className="font-bold text-slate-900">
                <a href={`/admin/dashboard/patients/${row.patientId}`} className="hover:underline">
                  {row.patientName}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold text-slate-500">Programme therapist</dt>
              <dd className="font-bold text-slate-900">{row.therapistName ?? "Not chosen yet"}</dd>
              {row.authorName && row.authorName !== row.therapistName && (
                <dd className="text-[11px] text-slate-500">Recommended by {row.authorName}</dd>
              )}
            </div>
            <div>
              <dt className="text-[11px] font-semibold text-slate-500">Started</dt>
              <dd className="text-slate-800">{formatClinicDate(row.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold text-slate-500">{row.purchaseId ? "Expires" : "Offer ends"}</dt>
              <dd className="text-slate-800">{row.expiresAt ? formatClinicDate(row.expiresAt) : "No end date"}</dd>
            </div>
          </dl>

          {/* Progress, in the three numbers the ID compresses. */}
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-800">
                {p.done} of {p.total} {row.mode === "home_visit" ? "visits" : "sessions"} done
              </p>
              <p className="text-[11px] text-slate-500">
                {row.booked} booked · {row.purchaseId ? `${toBook} still to book` : "not bought yet"}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="flex h-full">
                <div className="bg-teal-600" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                <div className="bg-sky-300" style={{ width: `${p.total ? (Math.min(row.booked, p.total - p.done) / p.total) * 100 : 0}%` }} />
              </div>
            </div>
            {row.nextSession && (
              <p className="mt-2 text-[11px] text-slate-600">
                Next: {row.nextSession.sessionCode ?? "a session"} on {formatClinicDateTime(row.nextSession.slotTime)}
              </p>
            )}
          </div>

          {/* What can be done from here. Each control renders only for a
              desk whose scope can call its route. */}
          {(canManage || canRefund || (row.code && row.sessions.length > 0)) && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-slate-800">Actions</p>
              {error && (
                <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-700">
                  {error}
                </p>
              )}
              {mode === "idle" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {canManage && row.stage === "waiting_approval" && row.carePlanId && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => post("/api/admin/review-care-plan", { carePlanId: row.carePlanId, decision: "approved", reason: "" })}
                        className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                      >
                        {busy ? "Approving…" : "Approve and send to the patient"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("reject")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Turn it down
                      </button>
                      <a
                        href={adminScreenHref("programmes", "review")}
                        className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-teal-700 hover:underline"
                      >
                        Change it before approving
                      </a>
                    </>
                  )}
                  {canManage && row.stage === "with_patient" && row.carePlanId && (
                    <button
                      type="button"
                      onClick={() => setMode("withdraw")}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Withdraw the recommendation
                    </button>
                  )}
                  {canManage && row.purchaseId && (
                    <button
                      type="button"
                      onClick={onManagePurchase}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Change therapist or extend expiry
                    </button>
                  )}
                  {/* Money's own control, on its own route (refund-package /
                      refund-home-visit-package guard with "money"), so a
                      Finance desk reading Programmes can still use it. */}
                  {canRefund && (
                    <button
                      type="button"
                      onClick={() => setMode("refund")}
                      className="rounded-lg border border-violet-300 px-3 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-50"
                    >
                      Refund what is left
                    </button>
                  )}
                  {row.code && row.sessions.length > 0 && (
                    <a
                      href={adminScreenHref("sessions", "all", `programme:${row.code}`)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-teal-700 hover:underline"
                    >
                      Open its sessions in All Sessions
                    </a>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <label htmlFor={reasonId} className="block text-[11px] font-semibold text-slate-700">
                    {mode === "reject"
                      ? "Why is the clinic turning it down? The therapist reads this."
                      : mode === "refund"
                        ? "Why is the clinic refunding it? Every unused session goes back and booked ones are cancelled."
                        : "Why is the clinic withdrawing it?"}
                  </label>
                  <textarea
                    id={reasonId}
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={mode === "reject" ? "e.g. the patient still has sessions left on a current programme" : "e.g. the therapist has left; a colleague will reassess"}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">At least {MIN_REASON} characters.</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={busy || reasonShort}
                      onClick={() =>
                        mode === "reject"
                          ? post("/api/admin/review-care-plan", { carePlanId: row.carePlanId, decision: "rejected", reason })
                          : mode === "refund"
                            ? post(
                                row.purchaseKind === "home_visit"
                                  ? "/api/admin/refund-home-visit-package"
                                  : "/api/admin/refund-package",
                                { purchaseId: row.purchaseId, reason }
                              )
                            : post("/api/admin/withdraw-care-plan", { carePlanId: row.carePlanId, reason })
                      }
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? "Saving…" : mode === "reject" ? "Turn it down" : mode === "refund" ? "Refund" : "Withdraw"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("idle");
                        setReason("");
                        setError(null);
                      }}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canSeeMoney && row.money && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-slate-800">Money</p>
              <dl className="mt-2 space-y-1 tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">List price</dt>
                  <dd className="font-semibold text-slate-800">{inr(row.money.listPricePaise)}</dd>
                </div>
                {row.money.discountPaise > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Discount{row.money.promoCode ? ` (${row.money.promoCode})` : ""}</dt>
                    <dd className="font-semibold text-emerald-700">-{inr(row.money.discountPaise)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-slate-100 pt-1">
                  <dt className="text-slate-600">Paid</dt>
                  <dd className="font-bold text-slate-900">
                    {row.money.paidPaise != null
                      ? inr(row.money.paidPaise)
                      : row.paymentMode === "cash_on_visit"
                        ? "At each visit"
                        : "Not paid yet"}
                  </dd>
                </div>
                {row.money.travelFeePaise > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Travel, per visit</dt>
                    <dd className="font-semibold text-slate-800">{inr(row.money.travelFeePaise)}</dd>
                  </div>
                )}
                {row.money.refundPaise != null && row.money.refundPaise > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Refunded</dt>
                    <dd className="font-semibold text-violet-700">{inr(row.money.refundPaise)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="font-bold text-slate-800">
              {row.mode === "home_visit" ? "Visits" : "Sessions"} in this programme
            </p>
            {row.sessions.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                {row.purchaseId ? "None booked yet." : "Sessions are booked once the patient has paid."}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {row.sessions.map((s, i) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-mono font-semibold text-slate-800">{s.sessionCode ?? `#${i + 1}`}</span>
                      <span className="ml-2 text-slate-600">{s.slotTime ? formatClinicDateTime(s.slotTime) : "No time yet"}</span>
                      <span className="block text-[11px] text-slate-500">{s.therapistName ?? "No therapist yet"}</span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        s.status === "completed"
                          ? "bg-teal-50 text-teal-700"
                          : s.status === "cancelled"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {SESSION_STATUS[s.status] ?? s.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(row.rationale || row.declineReason || row.reviewReason) && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-3">
              {row.rationale && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Why the therapist recommended it</p>
                  <blockquote className="mt-0.5 border-l-2 border-slate-200 pl-2.5 italic text-slate-700">{row.rationale}</blockquote>
                </div>
              )}
              {row.reviewReason && (
                <p>
                  <span className="font-semibold text-slate-700">{"Clinic's reason: "}</span>
                  {row.reviewReason}
                </p>
              )}
              {row.declineReason && (
                <p>
                  <span className="font-semibold text-slate-700">{"Patient's reason: "}</span>
                  {row.declineReason}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="font-bold text-slate-800">What happened</p>
            {row.timeline.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">Nothing recorded yet.</p>
            ) : (
              <ol className="mt-2 space-y-2.5">
                {row.timeline.map((e, i) => (
                  <li key={`${e.kind}-${e.at}-${i}`} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-600">
                      <i aria-hidden="true" className={`fa-solid ${EVENT_ICON[e.kind]}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800">{e.label}</span>
                      <span className="block text-[11px] text-slate-500">{formatClinicDateTime(e.at)}</span>
                      {e.detail && <span className="block text-[11px] text-slate-600 [overflow-wrap:anywhere]">{e.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

