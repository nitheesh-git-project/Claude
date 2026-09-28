import Link from "next/link";
import AdminScreenLink from "@/components/admin/AdminScreenLink";
import PagedList from "@/components/dashboard/PagedList";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import MoneyGlossary from "@/components/admin/MoneyGlossary";
import PayLaterAgeSetting, {
  PayLaterAgeNote,
  PayLaterMasterSwitch,
} from "@/components/admin/PayLaterAgeSetting";
import { MoneyTermInfo } from "@/components/admin/MoneyFigure";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import { adminScreenHref } from "@/lib/adminNav";
import { describeDiscount, type DiscountSource } from "@/lib/discounts";
import PayLaterSettlementQueue, {
  type QueuedSettlement,
} from "@/components/admin/PayLaterSettlementQueue";
import PayLaterRefundQueue from "@/components/admin/PayLaterRefundQueue";
import PayLaterWriteOffForm from "@/components/admin/PayLaterWriteOffForm";
import type {
  PayLaterRefundRow,
  PayLaterWrittenOffRow,
} from "@/lib/payLaterSettlementServer";
import { ADMIN_SCOPE_LABELS } from "@/lib/adminScope";
import {
  computeClinicReceivable,
  isAgedBalance,
  oldestOwedAgeDays,
  unclosedPayLaterSessions,
  isOpenPayLaterSession,
  type PayLaterAppointment,
  type PayLaterPaymentRow,
} from "@/lib/patientBalances";
import type { PayLaterAgeSettings } from "@/lib/payLaterSettingsServer";

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

/**
 * Why this session is owed less than the list price, when it is.
 *
 * Reads `describeDiscount` rather than composing its own sentence, so the
 * wording here and on every other surface that names a discount stays one
 * wording. Returns null when nothing came off, so an undiscounted session
 * carries no empty line -- the same rule `refundState`'s `none` follows.
 */
function discountNote(a: PayLaterAppointment): string | null {
  const off = a.discount_paise ?? 0;
  if (off <= 0) return null;
  const listed = a.list_price_paise ?? null;
  const label = describeDiscount((a.discount_source ?? null) as DiscountSource | null, off);
  if (!label) return null;
  return listed ? `${formatInr(listed)} list · ${label}` : label;
}

export default function AdminOwingTab({
  appointments,
  payments = [],
  patientNameById,
  nowMs,
  ageSetting,
  featureEnabled,
  canManageSettings = false,
  settlements = [],
  manualRefunds = [],
  writtenOff = [],
  canManageMoney = false,
}: {
  appointments: PayLaterAppointment[];
  payments?: PayLaterPaymentRow[];
  patientNameById: Map<string, string>;
  nowMs: number;
  /** How long a balance may sit before it is worth chasing, whether the clinic
   *  wants to be warned at all, and where that answer came from. */
  ageSetting: PayLaterAgeSettings;
  /** Payments a patient says they have made, waiting to be checked. Oldest
   *  first, and empty on a database without the table. */
  settlements?: QueuedSettlement[];
  /** Money the clinic has agreed to hand back and has not handed back yet.
   *  These carry no gateway payment to reverse, so a person has to move it. */
  manualRefunds?: PayLaterRefundRow[];
  /** Sessions the clinic has decided to stop chasing. Listed because the
   *  decision is reversible and a reversal has to be reachable -- these rows
   *  are dropped from every balance above. */
  writtenOff?: PayLaterWrittenOffRow[];
  /** Whether this desk may answer one. Both routes take
   *  `requireAdminScope("money")`, and a control a scope cannot call must not
   *  render -- Finance manages Money, so Finance answers these. */
  canManageMoney?: boolean;
  /** The clinic-wide switch. Off, nobody new can be put on terms -- but
   *  everything already owed stays listed and settleable. */
  featureEnabled: boolean;
  /** Gated on SETTINGS, not Money: Finance manages Money but holds settings at
   *  "none", so /api/admin/update-setting would refuse them -- and a control a
   *  scope cannot call must not render. They get the note instead of a gap. */
  canManageSettings?: boolean;
}) {
  const ageRule = { days: ageSetting.days, enabled: ageSetting.enabled };
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

  // Every owing patient's age, so the control below can say what a number
  // would do before it is saved. Same rows, same ages the cards render.
  const balanceAgeDays = balances
    .map((b) => oldestOwedAgeDays(sessionsByPatient.get(b.patientId) ?? [], nowMs))
    .filter((d): d is number => d !== null);

  const items = balances.map((b) => {
    const rows = (sessionsByPatient.get(b.patientId) ?? [])
      .slice()
      .sort((x, y) => (x.slot_time ?? "").localeCompare(y.slot_time ?? ""));
    const oldest = rows[0]?.slot_time ?? null;
    const ageDays = oldestOwedAgeDays(rows, nowMs);
    const isAged = isAgedBalance(ageDays, ageRule);

    return {
      id: b.patientId,
      // With the warning off there is no aged/recent distinction to filter by,
      // so every row is ungrouped and PagedList drops the chips -- a filter
      // dividing a list into "all of them" and "none" is noise.
      group: ageSetting.enabled ? (isAged ? "aged" : "recent") : undefined,
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
              // The control below is a block, so the row is a container with
              // the flex line inside it rather than being the flex line
              // itself -- a form is not phrasing content and nesting one in
              // the price span is markup a browser is entitled to reshape
              // under React.
              <li key={a.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-600">
                    {a.slot_time ? formatClinicDateShort(a.slot_time) : "No date"}
                  </span>
                  {/* The price agreed on the day, not today's -- so a patient
                      settling an old session can see it was not re-priced.
                      A discount applies to a booking on terms exactly as it
                      does to any other, so this figure can sit below what the
                      category costs; said plainly, because the person reading
                      it is about to ask somebody for it, and an unexplained
                      ₹499 against a ₹1,200 session reads as an error. */}
                  <span className="text-right">
                    <span className="font-semibold text-slate-700">
                      {formatInr(Math.max(0, a.amount_due_paise ?? 0))}
                    </span>
                    {discountNote(a) && (
                      <span className="block text-[11px] font-normal text-slate-500">
                        {discountNote(a)}
                      </span>
                    )}
                  </span>
                </div>
                {/* Deciding not to chase this one sits on the row it is
                    about, on the screen an admin is looking at when they
                    decide -- not in a drawer two navigations away. A session
                    with no agreed price has no figure to record as the loss,
                    and the route refuses it, so the control is not offered
                    either. */}
                {canManageMoney && (a.amount_due_paise ?? 0) > 0 && (
                  <div className="mt-0.5 text-right">
                    <PayLaterWriteOffForm
                      appointmentId={a.id}
                      amountPaise={a.amount_due_paise ?? 0}
                      writtenOff={false}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ),
    };
  });

  return (
    <div className="space-y-8">
      {/* Above the totals, because until these are answered the totals
          include money that may already be in the bank -- and because a
          patient is waiting on each one. */}
      {canManageMoney && (
        <PayLaterSettlementQueue
          settlements={settlements}
          patientNameById={patientNameById}
          nowMs={nowMs}
        />
      )}

      {/* The other direction, and above the totals for the same reason: a
          patient is out of pocket until somebody sends this back, and no
          gateway is going to do it. */}
      {canManageMoney && (
        <PayLaterRefundQueue refunds={manualRefunds} patientNameById={patientNameById} />
      )}

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
                isAgedBalance(oldestDays, ageRule) ? "text-amber-700" : "text-slate-900"
              }`}
            >
              {oldestDays === null ? "-" : `${oldestDays} day${oldestDays === 1 ? "" : "s"}`}
            </p>
            <p className="text-xs text-slate-500">
              {oldestDays === null
                ? "Nothing outstanding"
                : ageSetting.enabled
                  ? `Anything past ${ageSetting.days} days is worth a call`
                  : "Ageing warnings are off"}
            </p>
          </div>
        </div>
        {canManageSettings && (
          <div className="mt-4">
            <PayLaterMasterSwitch enabled={featureEnabled} />
          </div>
        )}
        {canManageSettings ? (
          <PayLaterAgeSetting
            setting={ageSetting}
            enabled={ageSetting.enabled}
            ageDays={balanceAgeDays}
          />
        ) : (
          <PayLaterAgeNote
            days={ageSetting.days}
            enabled={ageSetting.enabled}
            managerLabel={ADMIN_SCOPE_LABELS.full}
          />
        )}
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
            <AdminScreenLink
              href={adminScreenHref("sessions", "all")}
              className="font-semibold text-teal-700 hover:underline"
            >
              All Sessions
            </AdminScreenLink>
            , and the money appears everywhere at once.
          </p>
        </SurfaceCard>
      )}

      {/* Written off, and still here. These rows are gone from every figure
          above -- `isOpenPayLaterSession` drops them -- so without this list
          a write-off made by mistake would be undoable only in the database,
          which would make the undo a claim rather than a control. It is also
          the one place an admin can see what the clinic has decided to stop
          chasing, which is a figure worth knowing before granting more terms. */}
      {canManageMoney && writtenOff.length > 0 && (
        <SurfaceCard
          title="Written off"
          subtitle="Sessions the clinic has decided to stop chasing. The money the clinic earned on them still counts as revenue and the therapist has still been paid - the loss is recorded as a cost on Money → Costs."
        >
          <ul className="space-y-2">
            {writtenOff.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 text-xs last:border-0 last:pb-0"
              >
                <span>
                  <Link
                    href={`/admin/patients/${a.patient_id}`}
                    className="font-semibold text-slate-800 hover:text-teal-700"
                  >
                    {nameOf(a.patient_id)}
                  </Link>
                  <span className="ml-2 text-slate-500">
                    {a.slot_time ? formatClinicDateShort(a.slot_time) : "No date"}
                  </span>
                </span>
                <div className="text-right">
                  <span className="font-semibold text-slate-500 line-through">
                    {formatInr(Math.max(0, a.amount_due_paise ?? 0))}
                  </span>
                  <div className="mt-0.5">
                    <PayLaterWriteOffForm
                      appointmentId={a.id}
                      amountPaise={Math.max(0, a.amount_due_paise ?? 0)}
                      writtenOff
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
            filters={
              ageSetting.enabled
                ? [
                    { key: "aged", label: "Owed a while" },
                    { key: "recent", label: "Recent" },
                  ]
                : undefined
            }
            filterLabel="Show"
          />
        )}
      </SurfaceCard>

      <MoneyGlossary />
    </div>
  );
}
