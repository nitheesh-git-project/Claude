"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { WHATSAPP_SKIP_TEXT, type WhatsAppControls, type WhatsAppKind, type WhatsAppSkipReason } from "@/lib/whatsappRules";

export type WhatsAppLogRow = {
  id: string;
  createdAt: string;
  recipient: string;
  template: string;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
  redirected: boolean;
};

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60";

async function post(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/whatsapp/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
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

/**
 * Settings -> WhatsApp, the controls. Each change is one POST to
 * /api/admin/whatsapp/settings and a refresh. Unreadable switches draw a
 * notice, never a row of switches.
 */
export default function WhatsAppControlsEditor({
  configured,
  controls,
  kinds,
  consented,
  templates,
  log,
}: {
  configured: boolean;
  controls: WhatsAppControls | null;
  kinds: { key: WhatsAppKind; label: string; description: string }[];
  consented: number | null;
  templates: { name: string; body: string }[];
  log: WhatsAppLogRow[] | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState(controls?.testNumber ? `+${controls.testNumber}` : "");

  async function change(id: string, body: Record<string, unknown>, done: string) {
    setError(null);
    setPending(id);
    const failed = await post(body);
    setPending(null);
    if (failed) {
      setError(failed);
      return;
    }
    show(done);
    router.refresh();
  }

  return (
    <div data-testid="whatsapp-controls">
      <p
        role="status"
        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${configured ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        {configured
          ? "WhatsApp is set up on this server. Messages go out only while the switch below is on, and only to patients who said yes."
          : "Not set up yet. This needs the clinic's WhatsApp Business account (Meta business verification, an approved sender number and the templates below approved), then WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server. Until then nothing is sent and patients are not offered the choice."}
      </p>
      <p className="mb-4 text-sm text-slate-700" data-testid="whatsapp-consented">
        {consented === null ? "We couldn't count the patients who said yes just now." : `${consented} ${consented === 1 ? "patient has" : "patients have"} said yes to WhatsApp messages.`}
      </p>

      {!controls ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We couldn&apos;t check the WhatsApp switches just now, so nothing is sent. Refresh to try again.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Send WhatsApp messages</p>
              <p className="text-xs text-slate-600">{controls.sendingEnabled ? "On." : "Off. Nothing is sent. Turn on once the templates are approved."}</p>
            </div>
            <Switch
              on={controls.sendingEnabled}
              disabled={pending === "master"}
              label="Send WhatsApp messages"
              onToggle={() => void change("master", { sendingEnabled: !controls.sendingEnabled }, controls.sendingEnabled ? "WhatsApp switched off." : "WhatsApp switched on.")}
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Test mode</p>
            <p className="text-xs text-slate-600">
              {controls.testNumber ? `On. Every message goes to +${controls.testNumber} instead.` : "Off. Give one mobile number and every message goes there instead."}
            </p>
            <form
              className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void change("number", { testNumber: number }, number.trim() ? "Test mode on." : "Test mode off.");
              }}
            >
              <div className="min-w-0 flex-1">
                <label htmlFor="whatsapp-test-number" className="text-sm font-semibold text-slate-800">
                  Test number
                </label>
                <input
                  id="whatsapp-test-number"
                  type="tel"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
                />
              </div>
              <button type="submit" disabled={pending === "number"} className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800`}>
                Save
              </button>
              {controls.testNumber && (
                <button
                  type="button"
                  disabled={pending === "number"}
                  onClick={() => {
                    setNumber("");
                    void change("number", { testNumber: null }, "Test mode off.");
                  }}
                  className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
                >
                  Turn off test mode
                </button>
              )}
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Kinds of message</p>
            <ul className="mt-1 divide-y divide-slate-100">
              {kinds.map((k) => {
                const on = !controls.disabledKinds.includes(k.key);
                return (
                  <li key={k.key} className="flex items-center justify-between gap-3 py-1.5" data-whatsapp-kind={k.key}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{k.label}</p>
                      <p className="text-xs text-slate-600">{k.description}</p>
                    </div>
                    <Switch
                      on={on}
                      disabled={pending === `kind:${k.key}`}
                      label={`Send ${k.label} on WhatsApp`}
                      onToggle={() => void change(`kind:${k.key}`, { kind: k.key, enabled: !on }, `${k.label}: ${on ? "off" : "on"}.`)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <details className="mt-6 rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Templates to submit to Meta ({templates.length})</summary>
        <p className="mt-2 text-xs text-slate-600">
          Submit each one in WhatsApp Manager under exactly this name, category Utility, language English. Changing the wording needs Meta&apos;s
          approval again.
        </p>
        <ul className="mt-2 space-y-2">
          {templates.map((t) => (
            <li key={t.name} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-mono text-xs font-semibold text-slate-900">{t.name}</p>
              <p className="mt-1 text-slate-700">{t.body}</p>
            </li>
          ))}
        </ul>
      </details>

      <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-600">Last 100 messages</h3>
      {!log ? (
        <p role="status" className="mt-1 text-sm text-amber-900">
          We couldn&apos;t load the list just now. Refresh to try again.
        </p>
      ) : log.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">No messages yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[600px] text-left text-sm" data-testid="whatsapp-log">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">To</th>
                <th scope="col" className="px-3 py-2 font-semibold">Template</th>
                <th scope="col" className="px-3 py-2 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatClinicDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.recipient}
                    {r.redirected && <span className="block text-xs text-slate-600">test number</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-900">{r.template}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800">{r.status === "sent" ? "Sent" : r.status === "failed" ? "Failed" : "Not sent"}</span>
                    {r.reason && <span className="block text-xs text-slate-600">{WHATSAPP_SKIP_TEXT[r.reason as WhatsAppSkipReason] ?? r.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
