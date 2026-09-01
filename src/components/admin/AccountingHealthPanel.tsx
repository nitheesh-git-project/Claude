import {
  accountingIsClean,
  type AccountingHealth,
} from "@/lib/accountingHealth";

// Same local helper the Cash Ledger uses -- there is no shared formatInr in
// src/lib, and one call site does not earn a new module.
function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Whether the money and the sessions still agree with each other.
//
// A server component, because everything it shows is derived from reads the
// dashboard already makes and none of it is interactive -- there is
// deliberately no "fix this" button. Each of these three findings is either
// a data problem or a person doing something outside the normal flow, and
// both want a human looking rather than a sweep quietly papering over them.
export default function AccountingHealthPanel({ health }: { health: AccountingHealth }) {
  if (!health.available) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Accounting Health</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Not available yet — the session ledger tables haven&apos;t been applied to this
          database. Run <span className="font-mono text-slate-600">scripts/run-schema.mjs</span>{" "}
          (or push to <span className="font-mono text-slate-600">main</span>, which applies it)
          and this panel will start reporting.
        </p>
      </div>
    );
  }

  const clean = accountingIsClean(health);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="font-bold text-sm text-slate-800">Accounting Health</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-lg">
        Three questions about whether the books and the sessions still agree. Nothing here
        is fixed automatically: each finding is either a data problem or someone working
        outside the normal flow, and both want a person rather than a sweep.
      </p>

      {clean ? (
        <p className="text-xs text-slate-400 mt-4">
          All clear across {health.entitlementCount}{" "}
          {health.entitlementCount === 1 ? "package" : "packages"} — balances agree with the
          ledger, every captured payment is accounted for, and every delivered session has
          something behind it.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <Finding
            title="Balances that disagree"
            count={health.balanceMismatches.length}
            blurb="A package whose cached count, its ledger, or the older counter it is written alongside don't all say the same thing. Until these are zero, the ledger is not safe to read from."
          >
            {health.balanceMismatches.map((m) => (
              <Row
                key={m.entitlementId}
                left={<span className="font-mono text-[11px]">{m.entitlementId.slice(0, 8)}</span>}
                right={
                  <>
                    cached {m.cachedAvailable} · ledger {m.ledgerAvailable}
                    {m.legacyAvailable !== null ? ` · counter ${m.legacyAvailable}` : ""}
                  </>
                }
                note={m.problem.replace(/_/g, " ")}
              />
            ))}
          </Finding>

          <Finding
            title="Payments with nothing attached"
            count={health.unmatchedPayments.length}
            blurb="Money that was captured where nothing in the app knows what it bought. Usually a checkout that died between creating the order and recording what it was for. Match it by hand, or refund it."
          >
            {health.unmatchedPayments.map((p) => (
              <Row
                key={p.id}
                left={<span className="font-mono text-[11px]">{p.razorpayPaymentId ?? p.id.slice(0, 8)}</span>}
                right={formatInr(p.amountPaise)}
                note={p.capturedAt ? new Date(p.capturedAt).toLocaleString() : "No capture time"}
              />
            ))}
          </Finding>

          <Finding
            title="Delivered sessions with nothing behind them"
            count={health.sessionsWithoutBacking.length}
            blurb="Marked completed, but not paid for, not covered by a package, and no cash recorded. Either the record is wrong or the session was delivered outside the platform."
          >
            {health.sessionsWithoutBacking.map((s) => (
              <Row
                key={s.id}
                left={<span className="font-mono text-[11px]">{s.sessionCode ?? s.id.slice(0, 8)}</span>}
                right={s.slotTime ? new Date(s.slotTime).toLocaleString() : "No slot time"}
                note=""
              />
            ))}
          </Finding>
        </div>
      )}
    </div>
  );
}

function Finding({
  title,
  count,
  blurb,
  children,
}: {
  title: string;
  count: number;
  blurb: string;
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-slate-700">
          {title} <span className="text-slate-400 font-normal">— none</span>
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-semibold text-amber-700">
        {title} — {count}
      </p>
      <p className="text-[11px] text-slate-500 mt-1 max-w-lg">{blurb}</p>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function Row({
  left,
  right,
  note,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  note: string;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 border border-slate-200 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">{left}</p>
        {note && <p className="text-[11px] text-slate-500 mt-0.5">{note}</p>}
      </div>
      <p className="text-[11px] text-slate-600">{right}</p>
    </div>
  );
}
