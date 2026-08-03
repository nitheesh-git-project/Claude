"use client";

import { useMemo, useState } from "react";
import SessionDetailDrawer, {
  type SessionDetailAppointment,
  type ReassignmentLogEntry,
} from "@/components/admin/SessionDetailDrawer";
import { formatSlotRange, istDateKey, istMinutesOfDay } from "@/lib/formatSlotRange";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES } from "@/lib/pricing";

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

export default function AdminSessionStoryTab({
  appointments,
  people,
  categories,
  therapists,
  reassignmentLogs,
}: {
  appointments: SessionDetailAppointment[];
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

  const [dateFilter, setDateFilter] = useState("");
  const [sessionCodeFilter, setSessionCodeFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedAppointment, setSelectedAppointment] = useState<SessionDetailAppointment | null>(
    null
  );

  const rows = useMemo(() => {
    const trimmedCodeFilter = sessionCodeFilter.trim().toLowerCase();
    const filtered = appointments
      .filter((a) => !dateFilter || (a.slot_time && istDateKey(a.slot_time) === dateFilter))
      .filter(
        (a) => !trimmedCodeFilter || (a.session_code ?? "").toLowerCase().includes(trimmedCodeFilter)
      );

    const resolved = filtered.map((a) => {
      const category = a.category_id ? categoryMap.get(a.category_id) : undefined;
      return {
        a,
        patientName: peopleMap.get(a.patient_id) ?? "Unknown",
        therapistName: a.therapist_id ? peopleMap.get(a.therapist_id) ?? "Unknown" : "Unassigned",
        categoryTitle: category?.title ?? "—",
        price: a.amount_paid_paise ?? category?.price_paise ?? SESSION_FEE_PAISE,
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
  }, [appointments, dateFilter, sessionCodeFilter, sortKey, sortDir, peopleMap, categoryMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-bold text-lg text-slate-800">
            Session Story
            <span className="ml-2 text-xs font-normal text-slate-400">
              {rows.length} session{rows.length === 1 ? "" : "s"}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Every session — upcoming and completed — with ratings &amp; feedback from both sides.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={sessionCodeFilter}
            onChange={(e) => setSessionCodeFilter(e.target.value)}
            placeholder="Filter by Session ID"
            className="p-2 rounded-lg border border-slate-300 text-xs font-mono w-40"
          />
          {sessionCodeFilter && (
            <button
              onClick={() => setSessionCodeFilter("")}
              className="text-xs text-teal-700 font-semibold hover:underline"
            >
              Clear
            </button>
          )}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 text-xs"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-xs text-teal-700 font-semibold hover:underline"
            >
              Clear
            </button>
          )}
        </div>
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
              <SortHeader label="Therapist" sortKeyName="therapist" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Patient" sortKeyName="patient" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Category" sortKeyName="category" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Price" sortKeyName="price" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Status" sortKeyName="status" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <th className="py-2 pr-3 font-semibold">Payment</th>
              <th className="py-2 pr-3 font-semibold">Patient Rating</th>
              <th className="py-2 pr-3 font-semibold">Therapist Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-400">
                  No sessions found.
                </td>
              </tr>
            ) : (
              rows.map(({ a, patientName, therapistName, categoryTitle, price }) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedAppointment(a)}
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
                  <td className="py-2 pr-3 font-bold text-slate-900">{therapistName}</td>
                  <td className="py-2 pr-3 text-slate-600">{patientName}</td>
                  <td className="py-2 pr-3 text-slate-500">{categoryTitle}</td>
                  <td className="py-2 pr-3 text-slate-700 font-semibold whitespace-nowrap">
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
                      {a.status}
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
                    {a.patient_rating ? <Stars rating={a.patient_rating} /> : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {a.therapist_rating ? <Stars rating={a.therapist_rating} /> : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedAppointment && (
        <SessionDetailDrawer
          appointment={selectedAppointment}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={therapists}
          categories={categories}
          reassignmentLogs={reassignmentLogs}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
