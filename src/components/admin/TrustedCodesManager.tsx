"use client";

import { useId, useState } from "react";
import Link from "@/components/system/ProgressLink";
import Modal from "@/components/admin/Modal";
import PhoneNumberField from "@/components/PhoneNumberField";
import { useConfirm } from "@/lib/useConfirm";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { MIN_TRUSTED_REASON } from "@/lib/trustedPatientCode";

export type TrustedCodeRow = {
  id: string;
  code: string;
  patientName: string;
  reason: string;
  note: string | null;
  matchEmail: string | null;
  matchPhone: string | null;
  status: "active" | "redeemed" | "revoked";
  createdAt: string;
  redeemedAt: string | null;
  redeemedBy: { id: string; name: string } | null;
};

const STATUS: Record<TrustedCodeRow["status"], { label: string; tone: string }> = {
  active: { label: "Waiting to be used", tone: "bg-amber-50 text-amber-800" },
  redeemed: { label: "Redeemed", tone: "bg-teal-50 text-teal-800" },
  revoked: { label: "Cancelled", tone: "bg-slate-100 text-slate-600" },
};

/**
 * Trusted-patient codes on Money -> Costs, under the promo codes: a one-time
 * code that turns on pay later for the one person it names, before their
 * first payment. Not a discount -- it moves no money. The list says who each
 * is for, why, whether it has been used and by whom.
 */
export default function TrustedCodesManager({
  codes,
  payLaterEnabled,
}: {
  codes: TrustedCodeRow[] | null;
  payLaterEnabled: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), reason: useId(), note: useId(), email: useId() };

  function close() {
    if (busy) return;
    setOpen(false);
    setMade(null);
    setName("");
    setReason("");
    setNote("");
    setEmail("");
    setPhone("");
    setError(null);
  }

  async function create() {
    setError(null);
    if (!name.trim()) return setError("Give the patient's name.");
    if (reason.trim().length < MIN_TRUSTED_REASON) {
      return setError(`Say why this patient may pay later, in at least ${MIN_TRUSTED_REASON} characters.`);
    }
    if (!email.trim() && !phone.trim()) {
      return setError("Give the email or phone number of the patient it is for - only that account can use it.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trusted-codes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientName: name, reason, note, email, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Could not create the code. Please try again.");
      setMade(data.code);
      router.refresh();
    } catch {
      setError("Could not reach the server. No code was made.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: TrustedCodeRow) {
    const ok = await confirm(`Cancel ${row.code} for ${row.patientName}? It can no longer be used.`, {
      confirmLabel: "Cancel the code",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    const res = await fetch("/api/admin/trusted-codes/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return show(data.error ?? "Could not cancel it. Please try again.");
    show(`${row.code} is cancelled`);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="trusted-codes">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="font-display text-lg font-bold text-slate-800">Trusted-patient codes</h3>
          <p className="mt-1 text-xs text-slate-500">
            A one-time code that lets one named patient pay after their sessions, without a first payment. It is not a
            discount - nothing is taken off. Only the account with the email or phone you enter can use it; what they
            then owe shows under Owed by Patients.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!payLaterEnabled}
          title={payLaterEnabled ? undefined : "Turn pay later on under Owed by Patients first."}
          className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          Tap here to create a trusted-patient code
        </button>
      </div>
      {!payLaterEnabled && (
        <p className="mt-2 text-[11px] text-slate-500">Pay later is off for the clinic, so no code can be made or used.</p>
      )}

      {codes === null ? (
        <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          The codes could not be loaded just now. Refresh to try again.
        </p>
      ) : codes.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">No trusted-patient code yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {codes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-xs" data-testid="trusted-code-row">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{c.code}</span>
                  <span className="font-semibold text-slate-800">{c.patientName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS[c.status].tone}`}>
                    {STATUS[c.status].label}
                  </span>
                </p>
                <p className="mt-0.5 text-slate-600">Why: {c.reason}</p>
                {c.note && <p className="mt-0.5 text-slate-500">Note: {c.note}</p>}
                <p className="mt-0.5 text-slate-500">
                  For {[c.matchEmail, c.matchPhone].filter(Boolean).join(" or ")} · made {formatClinicDateTime(c.createdAt)}
                  {c.status === "redeemed" && c.redeemedAt && (
                    <>
                      {" "}
                      · used {formatClinicDateTime(c.redeemedAt)}
                      {c.redeemedBy && (
                        <>
                          {" "}
                          by{" "}
                          <Link href={`/admin/dashboard/patients/${c.redeemedBy.id}`} className="font-semibold text-teal-700 hover:underline">
                            {c.redeemedBy.name}
                          </Link>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
              {c.status === "active" && (
                <button
                  type="button"
                  onClick={() => void revoke(c)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:border-red-300 hover:text-red-700"
                >
                  Cancel code
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal title={made ? "Code created" : "Create a trusted-patient code"} onClose={close}>
          {made ? (
            <div className="space-y-3 text-xs text-slate-700" data-testid="trusted-code-made">
              <p>Give this code to {name.trim()}. They enter it in their dashboard, under Payments, to turn on pay later.</p>
              <p className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center font-mono text-xl font-bold tracking-widest text-teal-900">
                {made}
              </p>
              <p className="text-slate-500">It works once, and only for the account with the email or phone you gave.</p>
              <div className="flex justify-end">
                <button type="button" onClick={close} className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs" data-testid="trusted-code-form">
              <div>
                <label htmlFor={ids.name} className="mb-1 block font-semibold text-slate-800">
                  {"Patient's name "}
                  <span className="text-red-600">*</span>
                </label>
                <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="w-full rounded-lg border border-slate-300 p-2" />
              </div>
              <div>
                <label htmlFor={ids.reason} className="mb-1 block font-semibold text-slate-800">
                  Why are they trusted to pay later? <span className="text-red-600">*</span>
                </label>
                <textarea id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-slate-300 p-2" />
              </div>
              <div>
                <label htmlFor={ids.note} className="mb-1 block font-semibold text-slate-800">
                  Note <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <textarea id={ids.note} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className="w-full rounded-lg border border-slate-300 p-2" />
              </div>
              <p className="font-semibold text-slate-800">
                Their email or phone <span className="text-red-600">*</span>{" "}
                <span className="font-normal text-slate-500">- only that account can use the code</span>
              </p>
              <div>
                <label htmlFor={ids.email} className="mb-1 block text-slate-700">
                  Email
                </label>
                <input id={ids.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2" />
              </div>
              <PhoneNumberField value={phone} onChange={setPhone} label="Phone" labelClassName="mb-1 block text-slate-700" />
              {error && (
                <p role="alert" className="text-red-600">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} disabled={busy} className="rounded-xl bg-slate-200 px-4 py-2 font-semibold text-slate-800">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={busy}
                  className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create the code"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {dialog}
    </section>
  );
}
