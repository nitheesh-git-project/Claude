"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/useConfirm";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { EMAIL_SKIP_TEXT, type EmailControls, type EmailSkipReason } from "@/lib/emailControls";

export type EmailLogRow = {
  id: string;
  createdAt: string;
  kind: string;
  recipient: string;
  subject: string;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
  redirected: boolean;
};

type KindRow = { key: string; label: string; description: string; legal: boolean };

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60";

async function post(url: string, body: Record<string, unknown>): Promise<{ error: string | null; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { error: null, data };
    if (res.status === 429) return { error: "Too many changes at once - wait a moment and try again.", data };
    if (res.status === 403) return { error: "Your access does not include this change.", data };
    return { error: typeof data?.error === "string" ? data.error : "That didn't save. Please try again.", data };
  } catch {
    return { error: "That didn't save - check your connection and try again.", data: null };
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

const STATUS_STYLE: Record<EmailLogRow["status"], string> = {
  sent: "bg-teal-50 text-teal-900 border-teal-200",
  skipped: "bg-slate-50 text-slate-700 border-slate-200",
  failed: "bg-red-50 text-red-800 border-red-200",
};

function reasonText(reason: string | null): string | null {
  if (!reason) return null;
  return EMAIL_SKIP_TEXT[reason as EmailSkipReason] ?? reason;
}

/**
 * Settings -> Emails, the controls. Every change is one POST to
 * /api/admin/email/settings and a refresh; the test button posts to
 * /api/admin/email/test, which mails the signed-in admin only. Unreadable
 * switches draw a notice, never a row of switches.
 */
export default function EmailControlsEditor({
  configured,
  controls,
  kinds,
  log,
}: {
  configured: boolean;
  controls: EmailControls | null;
  kinds: KindRow[];
  log: EmailLogRow[] | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inbox, setInbox] = useState(controls?.testInbox ?? "");
  const [testResult, setTestResult] = useState<string | null>(null);

  async function change(id: string, body: Record<string, unknown>, done: string) {
    setError(null);
    setPending(id);
    const { error: failed } = await post("/api/admin/email/settings", body);
    setPending(null);
    if (failed) {
      setError(failed);
      return;
    }
    show(done);
    router.refresh();
  }

  async function sendTest() {
    setTestResult(null);
    setPending("test");
    const { error: failed, data } = await post("/api/admin/email/test", {});
    setPending(null);
    setTestResult(failed ?? (typeof data?.message === "string" ? data.message : "Done."));
    router.refresh();
  }

  async function toggleKind(k: KindRow, enabled: boolean) {
    if (!enabled && k.legal) {
      const ok = await confirm(
        `Stop "${k.label}" emails? People who send a complaint or ask for their data will not get a receipt by email, and the law expects one within set times. Only do this briefly, while testing.`,
        { confirmLabel: "Stop them", cancelLabel: "Keep sending" }
      );
      if (!ok) return;
    }
    await change(`kind:${k.key}`, { kind: k.key, enabled }, `${k.label}: ${enabled ? "on" : "off"}.`);
  }

  return (
    <div data-testid="email-controls">
      {dialog}
      {!configured && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Email isn&apos;t set up on this server yet (RESEND_API_KEY and EMAIL_FROM), so nothing is sent whatever is set here. Each attempt is
          still listed below.
        </p>
      )}

      {!controls ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We couldn&apos;t check the email switches just now. Complaint and data-request receipts still go out; other emails wait. Refresh to try
          again.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Send emails</p>
              <p className="text-xs text-slate-600">
                {controls.sendingEnabled
                  ? "On. Emails go out as normal."
                  : "Off. Nothing is sent except complaint and data-request receipts, and your test email. Each skipped email is listed below."}
              </p>
            </div>
            <Switch
              on={controls.sendingEnabled}
              disabled={pending === "master"}
              label="Send emails"
              onToggle={() =>
                void change("master", { sendingEnabled: !controls.sendingEnabled }, controls.sendingEnabled ? "Emails switched off." : "Emails switched on.")
              }
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Test mode</p>
            <p className="text-xs text-slate-600">
              {controls.testInbox
                ? `On. Every email goes to ${controls.testInbox} instead, with the real recipient in the subject.`
                : "Off. Give one inbox and every email goes there instead of to the real person - useful on staging."}
            </p>
            <form
              className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void change("inbox", { testInbox: inbox }, inbox.trim() ? `Test mode on: emails go to ${inbox.trim()}.` : "Test mode off.");
              }}
            >
              <div className="min-w-0 flex-1">
                <label htmlFor="email-test-inbox" className="text-sm font-semibold text-slate-800">
                  Test inbox
                </label>
                <input
                  id="email-test-inbox"
                  type="email"
                  value={inbox}
                  onChange={(e) => setInbox(e.target.value)}
                  placeholder="you@gmail.com"
                  autoComplete="email"
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
                />
              </div>
              <button type="submit" disabled={pending === "inbox"} className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800`}>
                Save
              </button>
              {controls.testInbox && (
                <button
                  type="button"
                  disabled={pending === "inbox"}
                  onClick={() => {
                    setInbox("");
                    void change("inbox", { testInbox: null }, "Test mode off.");
                  }}
                  className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
                >
                  Turn off test mode
                </button>
              )}
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Kinds of email</p>
            <ul className="mt-1 divide-y divide-slate-100">
              {kinds.map((k) => {
                const on = !controls.disabledKinds.includes(k.key as EmailControls["disabledKinds"][number]);
                return (
                  <li key={k.key} className="flex items-center justify-between gap-3 py-1.5" data-email-kind={k.key}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{k.label}</p>
                      <p className="text-xs text-slate-600">{k.description}</p>
                    </div>
                    <Switch on={on} disabled={pending === `kind:${k.key}`} label={`Send ${k.label}`} onToggle={() => void toggleKind(k, !on)} />
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void sendTest()}
          disabled={pending === "test"}
          className={`${BUTTON} border border-teal-700 bg-white text-teal-800 hover:bg-teal-50`}
        >
          {pending === "test" ? "Sending..." : "Send me a test email"}
        </button>
        {testResult && (
          <p role="status" className="text-sm text-slate-700" data-testid="email-test-result">
            {testResult}
          </p>
        )}
      </div>

      <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-600">Last 100 emails</h3>
      {!log ? (
        <p role="status" className="mt-1 text-sm text-amber-900">
          We couldn&apos;t load the list just now. Refresh to try again.
        </p>
      ) : log.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">No emails yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[640px] text-left text-sm" data-testid="email-log">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">To</th>
                <th scope="col" className="px-3 py-2 font-semibold">Subject</th>
                <th scope="col" className="px-3 py-2 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatClinicDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.recipient}
                    {r.redirected && <span className="block text-xs text-slate-600">test inbox</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-900">{r.subject}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                      {r.status === "sent" ? "Sent" : r.status === "failed" ? "Failed" : "Not sent"}
                    </span>
                    {reasonText(r.reason) && <span className="block text-xs text-slate-600">{reasonText(r.reason)}</span>}
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
