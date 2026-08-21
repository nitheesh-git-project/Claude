"use client";

import { useEffect, useMemo, useState } from "react";
import SessionDetailDrawer, {
  type SessionDetailAppointment,
  type ReassignmentLogEntry,
} from "@/components/admin/SessionDetailDrawer";
import type { HomeVisitRow } from "@/components/admin/HomeVisitVisitActions";
import JoinSessionButton from "@/components/JoinSessionButton";
import DownloadCsvButton from "@/components/admin/DownloadCsvButton";
import StatStrip from "@/components/dashboard/StatStrip";
import { toCsv } from "@/lib/csvExport";
import { formatSlotRange, istDateKey, istMinutesOfDay } from "@/lib/formatSlotRange";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES } from "@/lib/pricing";

// The one list of sessions.
//
// This replaces four separate lists of the same appointments rows: "All
// Bookings" (approvals tab), "Session Story", the Calendar's day panel, and
// the Home Visit queue. They were never different data -- only different
// filters and different subsets of the columns -- so an admin could never
// tell which one was authoritative. Filters are cheap; parallel screens that
// drift apart are not.
//
// A home visit is a row here with mode = Home visit, not a separate world
// (AGENTS.md: "Home Visit is a delivery mode, not a parallel booking
// system"). Everything specific to a visit -- address, travel fee, cash --
// lives in the shared session drawer, behind the same click as everything
// else about that session.

type Person = { id: string; full_name: string | null };
type Category = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes: number;
  active?: boolean;
};
type SortKey = "date" | "time" | "therapist" | "patient" | "category" | "price" | "status";

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function SortHeader({
  label,
  sortKeyName,
  sortKey,
  sortDir,
  onToggle,
  title,
}: {
  label: string;
  sortKeyName: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onToggle: (key: SortKey) => void;
  title?: string;
}) {
  const active = sortKey === sortKeyName;
  return (
    <th
      onClick={() => onToggle(sortKeyName)}
      title={title}
      className={`py-2 pr-3 font-semibold cursor-pointer select-none whitespace-nowrap transition ${
        active ? "text-slate-900" : "hover:text-slate-800"
      }`}
    >
      {label} {active && (sortDir === "asc" ? "▲" : "▼")}
    </th>
  );
}

const FILTER_STORAGE_KEY = "admin.allSessions.filters";

// How many rows are put into the DOM before the admin asks for the rest.
// The dashboard server-renders every screen at once, so an unbounded table
// here is HTML every admin downloads on every load whether they open this
// screen or not -- and it is the largest table on the page. Filtering, sort
// and CSV export all still run over the full set; this bounds only what is
// painted.
const INITIAL_ROW_LIMIT = 200;

type SavedFilters = {
  sessionCode: string;
  mode: "all" | "online" | "home_visit";
  status: string;
  payment: string;
  therapist: string;
  patient: string;
};

function selectCls() {
  return "p-2 rounded-lg border border-slate-300 text-xs bg-white";
}

export default function AdminAllSessionsTab({
  appointments,
  homeVisits,
  people,
  categories,
  therapists,
  reassignmentLogs,
}: {
  appointments: SessionDetailAppointment[];
  // Keyed by appointment id on the way in. Only home-visit rows appear here,
  // and only these rows get the mode badge and the drawer's visit panel.
  homeVisits: HomeVisitRow[];
  people: Person[];
  categories: Category[];
  therapists: { id: string; full_name: string; active?: boolean }[];
  reassignmentLogs: ReassignmentLogEntry[];
}) {
  const peopleMap = useMemo(
    () => new Map(people.map((p) => [p.id, p.full_name ?? "Unknown"])),
    [people]
  );
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const homeVisitMap = useMemo(() => new Map(homeVisits.map((v) => [v.id, v])), [homeVisits]);

  // Eight filters that an admin re-sets on every visit is eight small
  // annoyances a day. They are remembered in this browser and restored after
  // mount -- deliberately not in the URL, which belongs to "which screen am
  // I on", and deliberately not on the server, since this is a preference,
  // not data. Restored in an effect rather than in useState's initialiser so
  // the server-rendered HTML and the first client render still match.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sessionCodeFilter, setSessionCodeFilter] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "online" | "home_visit">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [therapistFilter, setTherapistFilter] = useState("all");
  const [patientFilter, setPatientFilter] = useState("all");
  // Restored from the browser's own store on the first client render. Not in
  // a useState initialiser, which also runs on the server where there is no
  // window; not in an effect, which would set state after paint and flash the
  // unfiltered list first. `filtersRestored` gates the save below so the
  // restore itself can't immediately overwrite what it just read.
  const [filtersRestored, setFiltersRestored] = useState(false);
  if (!filtersRestored && typeof window !== "undefined") {
    let restored: Partial<SavedFilters> = {};
    try {
      const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) restored = JSON.parse(saved) as Partial<SavedFilters>;
    } catch {
      // A corrupt or unavailable store is not worth a broken screen.
    }
    // A date range is deliberately not restored: "last week" saved on Friday
    // is the wrong week on Monday, and a stale range that hides today's
    // sessions looks like missing data.
    if (typeof restored.sessionCode === "string") setSessionCodeFilter(restored.sessionCode);
    if (restored.mode === "all" || restored.mode === "online" || restored.mode === "home_visit") {
      setModeFilter(restored.mode);
    }
    if (typeof restored.status === "string") setStatusFilter(restored.status);
    if (typeof restored.payment === "string") setPaymentFilter(restored.payment);
    if (typeof restored.therapist === "string") setTherapistFilter(restored.therapist);
    if (typeof restored.patient === "string") setPatientFilter(restored.patient);
    setFiltersRestored(true);
  }

  useEffect(() => {
    if (!filtersRestored) return;
    try {
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          sessionCode: sessionCodeFilter,
          mode: modeFilter,
          status: statusFilter,
          payment: paymentFilter,
          therapist: therapistFilter,
          patient: patientFilter,
        } satisfies SavedFilters)
      );
    } catch {
      // Same as above -- saving a preference must never break the list.
    }
  }, [
    filtersRestored,
    sessionCodeFilter,
    modeFilter,
    statusFilter,
    paymentFilter,
    therapistFilter,
    patientFilter,
  ]);
  const [showAllRows, setShowAllRows] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const trimmedCodeFilter = sessionCodeFilter.trim().toLowerCase();
    const filtered = appointments
      .filter((a) => {
        if (!fromDate && !toDate) return true;
        const key = a.slot_time ? istDateKey(a.slot_time) : "";
        if (!key) return false;
        if (fromDate && key < fromDate) return false;
        if (toDate && key > toDate) return false;
        return true;
      })
      .filter(
        (a) => !trimmedCodeFilter || (a.session_code ?? "").toLowerCase().includes(trimmedCodeFilter)
      )
      .filter((a) => {
        if (modeFilter === "all") return true;
        const isVisit = homeVisitMap.has(a.id);
        return modeFilter === "home_visit" ? isVisit : !isVisit;
      })
      .filter((a) => {
        if (statusFilter === "all") return true;
        // "Unassigned" is the one filter that isn't a status column -- it's
        // the question an admin actually asks ("who still needs someone on
        // them?"), so it lives in the same control rather than a second one.
        if (statusFilter === "unassigned") {
          return !a.therapist_id && a.status !== "cancelled";
        }
        if (statusFilter === "no_show") return a.no_show;
        return a.status === statusFilter;
      })
      .filter((a) => paymentFilter === "all" || a.payment_status === paymentFilter)
      .filter((a) => therapistFilter === "all" || a.therapist_id === therapistFilter)
      .filter((a) => patientFilter === "all" || a.patient_id === patientFilter);

    const resolved = filtered.map((a) => {
      const category = a.category_id ? categoryMap.get(a.category_id) : undefined;
      return {
        a,
        patientName: peopleMap.get(a.patient_id) ?? "Unknown",
        therapistName: a.therapist_id ? peopleMap.get(a.therapist_id) ?? "Unknown" : "Unassigned",
        categoryTitle: category?.title ?? "—",
        price: a.amount_paid_paise ?? category?.price_paise ?? SESSION_FEE_PAISE,
        isVisit: homeVisitMap.has(a.id),
      };
    });

    const sorted = [...resolved].sort((x, y) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp =
            (x.a.slot_time ? new Date(x.a.slot_time).getTime() : 0) -
            (y.a.slot_time ? new Date(y.a.slot_time).getTime() : 0);
          break;
        case "time":
          cmp =
            (x.a.slot_time ? istMinutesOfDay(x.a.slot_time) : 0) -
            (y.a.slot_time ? istMinutesOfDay(y.a.slot_time) : 0);
          break;
        case "therapist":
          cmp = x.therapistName.localeCompare(y.therapistName);
          break;
        case "patient":
          cmp = x.patientName.localeCompare(y.patientName);
          break;
        case "category":
          cmp = x.categoryTitle.localeCompare(y.categoryTitle);
          break;
        case "price":
          cmp = x.price - y.price;
          break;
        case "status":
          cmp = x.a.status.localeCompare(y.a.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    appointments,
    homeVisitMap,
    peopleMap,
    categoryMap,
    fromDate,
    toDate,
    sessionCodeFilter,
    modeFilter,
    statusFilter,
    paymentFilter,
    therapistFilter,
    patientFilter,
    sortKey,
    sortDir,
  ]);

  const visibleRows = showAllRows ? rows : rows.slice(0, INITIAL_ROW_LIMIT);

  // The drawer reads from the live prop rather than from a snapshot taken
  // when the row was clicked, so an edit made inside it (or by another admin)
  // is reflected the moment router.refresh() lands, instead of the drawer
  // showing stale values until it's closed and reopened.
  const selected = selectedId ? appointments.find((a) => a.id === selectedId) ?? null : null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setSessionCodeFilter("");
    setModeFilter("all");
    setStatusFilter("all");
    setPaymentFilter("all");
    setTherapistFilter("all");
    setPatientFilter("all");
  }

  const filtersActive =
    !!fromDate ||
    !!toDate ||
    !!sessionCodeFilter ||
    modeFilter !== "all" ||
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    therapistFilter !== "all" ||
    patientFilter !== "all";

  const csv = toCsv(rows, [
    { header: "Session ID", value: (r) => r.a.session_code ?? "" },
    { header: "Date", value: (r) => (r.a.slot_time ? istDateKey(r.a.slot_time) : "") },
    {
      header: "Time",
      value: (r) => formatSlotRange(r.a.slot_time, r.a.duration_minutes ?? BASE_DURATION_MINUTES),
    },
    { header: "Mode", value: (r) => (r.isVisit ? "Home visit" : "Online") },
    { header: "Patient", value: (r) => r.patientName },
    { header: "Therapist", value: (r) => r.therapistName },
    { header: "Category", value: (r) => r.categoryTitle },
    { header: "Amount (INR)", value: (r) => (r.price / 100).toFixed(2) },
    { header: "Status", value: (r) => (r.a.no_show ? "no-show" : r.a.status) },
    { header: "Payment", value: (r) => r.a.payment_status },
    { header: "Patient rating", value: (r) => r.a.patient_rating ?? "" },
    { header: "Therapist rating", value: (r) => r.a.therapist_rating ?? "" },
  ]);

  // A strip of the four figures an admin scans before reading any row --
  // the same shape every other dashboard opens with, computed over the
  // rows currently passing the filters so it always describes what is on
  // screen rather than the whole table.
  const visibleAppointments = rows.map((r) => r.a);
  const unassignedVisible = visibleAppointments.filter(
    (a) => !a.therapist_id && a.status !== "cancelled"
  ).length;
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayVisible = visibleAppointments.filter(
    (a) =>
      a.slot_time &&
      a.status !== "cancelled" &&
      new Date(a.slot_time).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === todayKey
  ).length;
  const cancelledVisible = visibleAppointments.filter((a) => a.status === "cancelled").length;
  // Presence in homeVisits is what makes a session a home visit -- that
  // list is already scoped to visit_mode = 'home_visit' upstream.
  const homeVisitsVisible = visibleAppointments.filter((a) => homeVisitMap.has(a.id)).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-800">
            All Sessions
            <span className="ml-2 text-xs font-normal text-slate-400">
              {rows.length} of {appointments.length}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Every session and every home visit — upcoming, delivered and cancelled — with
            ratings from both sides. Click a row for the full record.
          </p>
        </div>
        <DownloadCsvButton filename="sessions.csv" csv={csv} disabled={rows.length === 0} />
      </div>

      <div className="mb-4">
        <StatStrip
          cells={[
            {
              label: "Showing",
              value: String(rows.length),
              unit: rows.length === 1 ? "session" : "sessions",
              note: `of ${appointments.length} on record`,
              accent: "bg-teal-500",
            },
            {
              label: "No therapist",
              value: String(unassignedVisible),
              note: unassignedVisible === 0 ? "All assigned" : "Nobody is running these yet",
              accent: unassignedVisible > 0 ? "bg-amber-500" : "bg-emerald-500",
            },
            {
              label: "Today",
              value: String(todayVisible),
              note: "In this filtered set",
              accent: "bg-blue-500",
            },
            {
              label: "Home visits",
              value: String(homeVisitsVisible),
              note: cancelledVisible > 0 ? `${cancelledVisible} cancelled in view` : "Travel sessions in view",
              accent: "bg-slate-400",
            },
          ]}
        />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={sessionCodeFilter}
            onChange={(e) => setSessionCodeFilter(e.target.value)}
            placeholder="Session ID"
            className="p-2 rounded-lg border border-slate-300 text-xs font-mono w-32"
          />
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={selectCls()}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={selectCls()}
            />
          </label>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
            className={selectCls()}
          >
            <option value="all">Any mode</option>
            <option value="online">Online</option>
            <option value="home_visit">Home visit</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectCls()}
          >
            <option value="all">Any status</option>
            <option value="unassigned">Needs a therapist</option>
            <option value="requested">Requested</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className={selectCls()}
          >
            <option value="all">Any payment</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="refunded">Refunded</option>
          </select>
          <select
            value={therapistFilter}
            onChange={(e) => setTherapistFilter(e.target.value)}
            className={selectCls()}
          >
            <option value="all">Any therapist</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className={selectCls()}
          >
            <option value="all">Any patient</option>
            {people
              .filter((p) => p.full_name)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {filtersActive
            ? "These filters are remembered on this device — clear them to see everything."
            : "Filters are remembered on this device, except the date range."}{" "}
          Unpaid is normal for a cash-on-visit home visit — money changes hands at the door,
          so check the visit itself rather than reading payment status as “never paid”.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-semibold">Session ID</th>
              <SortHeader label="Date" sortKeyName="date" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader
                label="Time"
                sortKeyName="time"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
                title="Sorts by time of day only, independent of date"
              />
              <th className="py-2 pr-3 font-semibold">Mode</th>
              <SortHeader label="Therapist" sortKeyName="therapist" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Patient" sortKeyName="patient" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Category" sortKeyName="category" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Price" sortKeyName="price" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Status" sortKeyName="status" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <th className="py-2 pr-3 font-semibold">Payment</th>
              <th className="py-2 pr-3 font-semibold">Patient Rating</th>
              <th className="py-2 pr-3 font-semibold">Therapist Rating</th>
              <th className="py-2 pr-3 font-semibold">Join</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-6 text-center text-slate-400">
                  No sessions match these filters.
                </td>
              </tr>
            ) : (
              visibleRows.map(({ a, patientName, therapistName, categoryTitle, price, isVisit }) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="py-2 pr-3 text-slate-400 font-mono">{a.session_code ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                    {a.slot_time
                      ? new Date(a.slot_time).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Kolkata",
                        })
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                    {formatSlotRange(a.slot_time, a.duration_minutes ?? BASE_DURATION_MINUTES)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span
                      className={`font-semibold px-2 py-1 rounded-full ${
                        isVisit ? "text-teal-700 bg-teal-50" : "text-slate-500 bg-slate-100"
                      }`}
                    >
                      {isVisit ? "Home visit" : "Online"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-bold text-slate-900">
                    {therapistName}
                    {!a.therapist_id && a.status !== "cancelled" && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-700">
                        needs one
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{patientName}</td>
                  <td className="py-2 pr-3 text-slate-500">{categoryTitle}</td>
                  <td className="py-2 pr-3 text-slate-700 font-semibold whitespace-nowrap tabular-nums">
                    ₹{(price / 100).toLocaleString("en-IN")}
                    {a.payment_status !== "paid" && (
                      <span className="text-slate-400 font-normal"> (est.)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`capitalize font-semibold px-2 py-1 rounded-full ${
                        STATUS_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {a.no_show ? "No-show" : a.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`capitalize font-semibold px-2 py-1 rounded-full ${
                        a.payment_status === "paid"
                          ? "text-green-700 bg-green-50"
                          : "text-slate-500 bg-slate-100"
                      }`}
                    >
                      {a.payment_status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {a.patient_rating ? (
                      <Stars rating={a.patient_rating} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {a.therapist_rating ? (
                      <Stars rating={a.therapist_rating} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                    <JoinSessionButton
                      meetLink={a.meet_link}
                      slotTime={a.slot_time}
                      status={a.status}
                      durationMinutes={a.duration_minutes}
                      alwaysActive
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs">
          <span className="text-slate-500">
            Showing the first {visibleRows.length} of {rows.length} matching sessions.
          </span>
          <button
            onClick={() => setShowAllRows(true)}
            className="font-semibold text-teal-700 hover:underline"
          >
            Show all
          </button>
        </div>
      )}

      {selected && (
        <SessionDetailDrawer
          appointment={selected}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={therapists}
          categories={categories}
          reassignmentLogs={reassignmentLogs}
          homeVisit={homeVisitMap.get(selected.id) ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
