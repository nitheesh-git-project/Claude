import Link from "next/link";
import PagedList from "@/components/dashboard/PagedList";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import MoneyGlossary from "@/components/admin/MoneyGlossary";
import { MoneyTermInfo } from "@/components/admin/MoneyFigure";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import { adminScreenHref } from "@/lib/adminNav";
import {
  computeClinicReceivable,
  oldestOwedAgeDays,
  unclosedPayLaterSessions,
  isOpenPayLaterSession,
  type PayLaterAppointment,
  type PayLaterPaymentRow,
} from "@/lib/patientBalances";

// Money → Owed by Patients.
//
// The mirror of Payouts: that screen is money out, per person, with the
// control that settles it; this one is money in, per patient, with the
// control that settles that. Its own screen rather than a card on Summary
// for two reasons. It is the only place these rows are listed, so a count
// pointing anywhere else would land a reader on a screen not containing the
// rows it counted. And it is a balance -- true right now, all time -- where
// every other Money screen moves with the dates in view.
//
// With no ceiling on what a patient may owe, the two figures at the top are
// the whole of the early warning: the total, and how long the oldest of it
// has been owed. A patient owing ₹1,200 for a week is ordinary; the same
// ₹1,200 for four months is what this screen exists to make visible.

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function AdminOwingTab({
  appointments,
  payments = [],
  patientNameById,
  nowMs,
  agedAfterDays,
}: {
  appointments: PayLaterAppointment[];
  payments?: PayLaterPaymentRow[];
  patientNameById: Map<string, string>;
  nowMs: number;
  /** Past this, a balance is old enough to chase. */
  agedAfterDays: number;
}) {
  const { totalPaise, balances } = computeClinicReceivable(appointments, payments);
  const oldestDays = oldestOwedAgeDays(appointments, nowMs);
  const unclosed = unclosedPayLaterSessions(appointments, nowMs);

  const openSessions = appointments.filter(isOpenPayLaterSession);
  const sessionsByPatient = new Map<string, PayLaterAppointment[]>();
  for (const a of openSessions) {
    const list = sessionsByPatient.get(a.patient_id) ?? [];
    list.push(a);
    sessionsByPatient.set(a.patient_id, list);
  }

  const nameOf = (id: string) => patientNameById.get(id) ?? "Unknown patient";

  const items = balances.map((b) => {
    const rows = (sessionsByPatient.get(b.patientId) ?? [])
      .slice()
      .sort((x, y) => (x.slot_time ?? "").localeCompare(y.slot_time ?? ""));
    const oldest = rows[0]?.slot_time ?? null;
    const ageDays = oldestOwedAgeDays(rows, nowMs);
    const isAged = ageDays !== null && ageDays >= agedAfterDays;

    return {
      id: b.patientId,
      group: isAged ? "aged" : "recent",
      node: (
        <div
          className={`rounded-2xl border p-4 ${
            isAged ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={`/admin/patients/${b.patientId}`}
              className="text-sm font-bold text-slate-900 hover:text-teal-700"
            >
              {nameOf(b.patientId)}
            </Link>
            <span className="text-base font-bold text-slate-900">{formatInr(b.owedPaise)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {b.owedCount} session{b.owedCount === 1 ? "" : "s"}
            {oldest ? ` · oldest ${formatClinicDateShort(oldest)}` : ""}
            {ageDays !== null ? ` · ${ageDays} day${ageDays === 1 ? "" : "s"}` : ""}
          </p>
          {/* Money already received and not yet applied to a session. Stated
              rather than silently netted off, or the total would look wrong
              against the sessions listed beneath it. */}
          {b.unallocatedPaise > 0 && (
            <p className="mt-1 text-xs font-semibold text-teal-700">
              {formatInr(b.unallocatedPaise)} received and not yet applied
            </p>
          )}
          <ul className="mt-3 space-y-1">
            {rows.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-slate-600">
                  {a.slot_time ? formatClinicDateShort(a.slot_time) : "No date"}
                </span>
                {/* The price agreed on the day, not today's -- so a patient
                    settling an old session can see it was not re-priced. */}
                <span className="font-semibold text-slate-700">
                  {formatInr(Math.max(0, a.amount_due_paise ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    };
  });

  return (
    <div className="space-y-8">
      <SurfaceCard
        title="Owed by patients"
        subtitle="Patients you have allowed to pay after their treatment. Counted once a session has been delivered - a booked session owes nothing."
      >
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total owed
              </p>
              <MoneyTermInfo term="owed_by_patients" />
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatInr(totalPaise)}</p>
            <p className="text-xs text-slate-500">
              {balances.length} patient{balances.length === 1 ? "" : "s"} · right now, all time
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Owed longest
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                oldestDays !== null && oldestDays >= agedAfterDays
                  ? "text-amber-700"
                  : "text-slate-900"
              }`}
            >
              {oldestDays === null ? "-" : `${oldestDays} day${oldestDays === 1 ? "" : "s"}`}
            </p>
            <p className="text-xs text-slate-500">
              {oldestDays === null
                ? "Nothing outstanding"
                : `Anything past ${agedAfterDays} days is worth a call`}
            </p>
          </div>
        </div>
      </SurfaceCard>

      {/* The one place money can silently fail to exist. Debt, revenue and
          the therapist's own pay all appear at completion, so a session
          nobody closed produces none of the three and no screen has anything
          to show. Every other failure here is a wrong number, which a check
          can catch; this is an absent one, which nothing would. */}
      {unclosed.length > 0 && (
        <SurfaceCard
          title="Sessions that were never closed"
          subtitle="These have been and gone and nobody marked them done - so nothing has been recorded for them at all: nothing owed, nothing earned, and no pay for the therapist."
        >
          <ul className="space-y-1.5">
            {unclosed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <Link
                  href={`/admin/patients/${a.patient_id}`}
                  className="font-semibold text-slate-800 hover:text-teal-700"
                >
                  {nameOf(a.patient_id)}
                </Link>
                <span className="text-slate-500">
                  {a.slot_time ? formatClinicDateShort(a.slot_time) : "No date"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Close them on{" "}
            <Link
              href={adminScreenHref("sessions", "all")}
              className="font-semibold text-teal-700 hover:underline"
            >
              All Sessions
            </Link>
            , and the money appears everywhere at once.
          </p>
        </SurfaceCard>
      )}

      <SurfaceCard title="Who owes what">
        {items.length === 0 ? (
          <EmptyState
            icon="fa-hand-holding-heart"
            title="Nobody owes anything"
            body="Patients who pay after their treatment will show here once a session has been delivered."
          />
        ) : (
          <PagedList
            items={items}
            noun="patient"
            nounPlural="patients"
            storageKey="admin-owing"
            className="space-y-3"
            filters={[
              { key: "aged", label: "Owed a while" },
              { key: "recent", label: "Recent" },
            ]}
            filterLabel="Show"
          />
        )}
      </SurfaceCard>

      <MoneyGlossary />
    </div>
  );
}
