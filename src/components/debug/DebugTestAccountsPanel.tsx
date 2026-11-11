"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import {
  TEST_ACCOUNT_SET,
  TEST_CARD_FIELDS,
  credentialsText,
  groupTestAccounts,
  isRazorpayTestKey,
  testAccountLoginPath,
  testCardText,
  type TestAccountRow,
} from "@/lib/debugTestAccounts";

/**
 * The debug bar's Test accounts panel.
 *
 * One tap makes a patient, a ready-to-book therapist, a hospital partner and
 * an admin of each desk; each is listed with its email and password and a
 * copy button for each, so signing in to test something is a paste. Delete
 * removes an account and everything it did, payments included -- only ever
 * one this panel made (src/lib/debugTestAccounts.ts).
 *
 * The server decides whether it works at all: a Master Admin must be signed
 * in, and the server must have the debug bar on (it follows
 * NEXT_PUBLIC_SHOW_DEBUG_NAV). The panel says which is missing rather than
 * showing an empty list.
 */
type Status =
  | { kind: "loading" }
  | { kind: "ready"; accounts: TestAccountRow[] }
  | { kind: "off" }
  | { kind: "signed_out" }
  | { kind: "error"; message: string };

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

export default function DebugTestAccountsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="debug-test-accounts-button"
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold h-7 px-2.5 py-0 rounded-lg transition"
      >
        Test accounts
      </button>
      {open && <Panel onClose={() => setOpen(false)} />}
    </>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: "debug-test-accounts-title" });
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/debug-test-accounts", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { accounts?: TestAccountRow[]; error?: string };
      if (res.status === 404) return setStatus({ kind: "off" });
      if (res.status === 401) return setStatus({ kind: "signed_out" });
      if (!res.ok) return setStatus({ kind: "error", message: data.error ?? "Could not load test accounts." });
      setStatus({ kind: "ready", accounts: data.accounts ?? [] });
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server. Please try again." });
    }
  }, []);

  useEffect(() => {
    // The first read happens when the panel opens; the fetch resolves later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(key: string, body: Record<string, unknown>, done: (data: Record<string, unknown>) => string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/debug-test-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setNotice(res.ok ? done(data) : String(data.error ?? "That did not work. Please try again."));
    } catch {
      setNotice("Could not reach the server. Nothing was changed. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(null);
      setConfirmAll(false);
      await load();
    }
  }

  const accounts = status.kind === "ready" ? status.accounts : [];
  const groups = groupTestAccounts(accounts);

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/50" onClick={onClose}>
        <div
          ref={panelRef}
          {...dialogProps}
          onClick={(e) => e.stopPropagation()}
          data-testid="debug-test-accounts"
          className="flex h-full w-full max-w-md flex-col bg-white text-slate-800 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 id="debug-test-accounts-title" className="text-sm font-bold text-slate-900">
                Test accounts
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Throwaway logins for testing. Delete removes them and everything they did.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close test accounts"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs">
            {status.kind === "loading" && (
              <p className="flex items-center gap-2 text-slate-500">
                <Spinner size={12} />
                <span>Loading…</span>
              </p>
            )}
            {status.kind === "off" && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900" data-testid="debug-test-accounts-off">
                Switched off on this server: its debug bar is turned off, so test accounts are too.
              </p>
            )}
            {status.kind === "signed_out" && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                Sign in as a Master Admin in this browser first, then open this panel again.
              </p>
            )}
            {status.kind === "error" && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800" role="alert">
                {status.message}
              </p>
            )}

            {status.kind === "ready" && (
              <>
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void act("create", { action: "create" }, (d) => {
                        const n = Array.isArray(d.accounts) ? d.accounts.length : 0;
                        return `Made ${n} test accounts. Copy a login below.`;
                      })
                    }
                    data-testid="debug-test-accounts-create"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                  >
                    {busy === "create" && <Spinner size={12} />}
                    {busy === "create" ? "Making accounts…" : `Make all ${TEST_ACCOUNT_SET.length} at once`}
                  </button>
                  <p className="text-[11px] font-semibold text-slate-600">Or one at a time:</p>
                  <div className="grid grid-cols-2 gap-1.5" data-testid="debug-test-accounts-one">
                    {TEST_ACCOUNT_SET.map((plan) => (
                      <button
                        key={plan.key}
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void act(`one:${plan.key}`, { action: "create", key: plan.key }, () => `Made a test ${plan.label.toLowerCase()}. Copy its login below.`)
                        }
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-teal-200 px-2 py-2 text-[11px] font-semibold text-teal-800 transition hover:bg-teal-50 disabled:opacity-60"
                      >
                        {busy === `one:${plan.key}` ? <Spinner size={10} /> : <i className="fa-solid fa-plus" aria-hidden="true" />}
                        <span>{plan.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    The therapist is approved with Full day hours Monday to Saturday. Sign in from a private window to stay signed in here.
                  </p>
                </div>

                {notice && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700" role="status" data-testid="debug-test-accounts-notice">
                    {notice}
                  </p>
                )}

                {groups.length === 0 ? (
                  <p className="text-slate-500">No test accounts yet.</p>
                ) : (
                  <>
                    {groups.map((group) => (
                      <section key={group.batchId} className="rounded-xl border border-slate-200" data-testid="debug-test-set">
                        <div className="border-b border-slate-100 px-3 py-2">
                          <p className="text-[11px] font-semibold text-slate-600">{`Made ${formatClinicDateTime(group.createdAt)}`}</p>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {group.accounts.map((a) => (
                            <li key={a.user_id} className="space-y-1.5 px-3 py-2.5" data-testid="debug-test-account">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-slate-900">{a.label}</p>
                                <div className="flex items-center gap-1">
                                  <a
                                    href={testAccountLoginPath(a.role)}
                                    target="_blank"
                                    rel="noreferrer"
                                    data-no-loader
                                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
                                  >
                                    Login page
                                  </a>
                                  <button
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      void act(`del:${a.user_id}`, { action: "delete", userId: a.user_id }, () => `${a.label} deleted, with everything it did.`)
                                    }
                                    aria-label={`Delete ${a.label} (${a.email})`}
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    {busy === `del:${a.user_id}` && <Spinner size={10} />}
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                              <CopyRow label="Email" value={a.email} />
                              <CopyRow label="Password" value={a.password} />
                              <CopyButton label={`Copy ${a.label} email and password`} value={credentialsText(a.email, a.password)} text="Copy both" />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}

                    {confirmAll ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
                        <p>{`Delete all ${accounts.length} test accounts and every session, payment and record they have?`}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              void act("all", { action: "delete_all" }, (d) => {
                                const n = Array.isArray(d.removed) ? d.removed.length : 0;
                                const f = Array.isArray(d.failed) ? d.failed.length : 0;
                                return f > 0 ? `Deleted ${n}; ${f} could not be deleted.` : `Deleted ${n} test accounts.`;
                              })
                            }
                            data-testid="debug-test-accounts-delete-all-confirm"
                            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {busy === "all" && <Spinner size={12} />}
                            {busy === "all" ? "Deleting…" : "Yes, delete all"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAll(false)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Keep them
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setConfirmAll(true)}
                        data-testid="debug-test-accounts-delete-all"
                        className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Delete all test accounts
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            <TestCardSection />
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function TestCardSection() {
  return (
    <section className="rounded-xl border border-slate-200 p-3" data-testid="debug-test-card">
      <h3 className="text-xs font-bold text-slate-900">Test card</h3>
      {isRazorpayTestKey(RAZORPAY_KEY) ? (
        <>
          <p className="mt-0.5 text-[11px] text-slate-500">
            For card payments in Razorpay&apos;s test mode. Razorpay&apos;s card form cannot be filled from here, so copy
            each value and paste it in. The same box shows over the payment window while it is open.
          </p>
          <TestCardRows />
        </>
      ) : (
        <p className="mt-0.5 text-[11px] text-slate-500">
          This site uses a live Razorpay key, so the test card would be declined.
        </p>
      )}
    </section>
  );
}

export function TestCardRows() {
  return (
    <div className="mt-2 space-y-1">
      {TEST_CARD_FIELDS.map((f) => (
        <CopyRow key={f.key} label={f.label} value={f.copy} />
      ))}
      <CopyButton label="Copy all test card details" value={testCardText()} text="Copy all" />
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-20 shrink-0 text-[11px] text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 font-mono text-[12px] text-slate-900 [overflow-wrap:anywhere]">{value}</span>
      <CopyButton label={`Copy ${label}`} value={value} />
    </div>
  );
}

function CopyButton({ label, value, text }: { label: string; value: string; text?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1500);
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
    >
      {state === "copied" ? (
        <span className="text-teal-700">Copied</span>
      ) : state === "failed" ? (
        <span>Select to copy</span>
      ) : (
        <>
          <i className="fa-solid fa-copy" aria-hidden="true" />
          {text && <span>{text}</span>}
        </>
      )}
    </button>
  );
}
