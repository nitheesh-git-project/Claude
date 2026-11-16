"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/admin/Modal";
import { formatClinicDate } from "@/lib/formatDateTime";
import {
  DATA_REQUEST_STATUS_LABELS,
  DELETION_DEADLINE_DAYS,
  type DataRequestStatus,
} from "@/lib/dataRequests";

export type OpenDeletion = { reference: string; status: DataRequestStatus; created_at: string } | null;

/**
 * "Your data" on a patient's, therapist's or hospital partner's profile:
 * download a PDF of everything the clinic holds about them, and ask for the
 * account to be deleted. Deletion is a request a person works within
 * DELETION_DEADLINE_DAYS, never an instant delete -- the dialog says what is
 * removed and what the law makes the clinic keep, before anything is sent.
 *
 * `openDeletion` is the person's live request (YourDataSection reads it);
 * `readFailed` says that read did not come back, so the screen never offers
 * a second request it cannot see is already open.
 */
export default function YourDataCard({
  openDeletion,
  readFailed,
  keptRecords,
}: {
  openDeletion: OpenDeletion;
  readFailed: boolean;
  /** What stays after deletion, in this role's words. */
  keptRecords: string;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/account/my-data", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setDownloadError(body.error ?? "We couldn't prepare your data just now. Please try again.");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "your-data.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function send(body: Record<string, unknown>) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; reference?: string };
      if (!res.ok) {
        setError(data.error ?? "That didn't go through. Please try again.");
        return false;
      }
      if (data.reference) setSent(data.reference);
      router.refresh();
      return true;
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      return false;
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="your-data" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Your data</h2>
      <p className="text-xs text-slate-600 mb-5">
        See everything we hold about you, or ask us to delete your account.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Download my data</p>
          <p className="text-xs text-slate-600 mt-0.5">A PDF of your details, sessions, payments and agreements.</p>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="min-h-11 shrink-0 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          <i aria-hidden className="fa-solid fa-file-arrow-down mr-2" />
          {downloading ? "Preparing…" : "Download PDF"}
        </button>
      </div>
      {downloadError && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {downloadError}
        </p>
      )}

      <div className="pt-5">
        <p className="text-sm font-semibold text-slate-900">Delete my account</p>
        {readFailed ? (
          <p className="text-xs text-amber-800 mt-1">
            We couldn&apos;t check whether you already have a request open. Refresh the page to try again.
          </p>
        ) : openDeletion || sent ? (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>
              Your request <strong>{openDeletion?.reference ?? sent}</strong>
              {openDeletion ? ` from ${formatClinicDate(openDeletion.created_at)}` : ""} is{" "}
              <strong>{DATA_REQUEST_STATUS_LABELS[openDeletion?.status ?? "open"].toLowerCase()}</strong>. We will
              finish it within {DELETION_DEADLINE_DAYS} days and email you.
            </p>
            {(openDeletion?.status ?? "open") === "open" && (
              <button
                type="button"
                onClick={() => void send({ withdraw: true }).then((ok) => ok && setSent(null))}
                disabled={sending}
                className="mt-2 min-h-11 font-semibold text-amber-900 underline underline-offset-2 disabled:opacity-60"
              >
                {sending ? "Taking it back…" : "Take back my request"}
              </button>
            )}
            {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-600 mt-0.5 mb-3">
              We remove your sign-in and contact details within {DELETION_DEADLINE_DAYS} days.
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAsking(true);
              }}
              className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
              Ask to delete my account
            </button>
          </>
        )}
      </div>

      {asking && (
        <Modal title="Delete your account?" onClose={() => !sending && setAsking(false)}>
          <div className="space-y-4 text-sm text-slate-700">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>You won&apos;t be able to sign in, and any upcoming sessions are cancelled.</li>
              <li>Your name, email and phone number are removed.</li>
              <li>{keptRecords}</li>
              <li>Our team finishes it within {DELETION_DEADLINE_DAYS} days. You can take it back until they start.</li>
            </ul>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-800">Why are you leaving? (optional)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={3}
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </label>
            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAsking(false)}
                disabled={sending}
                className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700"
              >
                Keep my account
              </button>
              <button
                type="button"
                onClick={() => void send({ reason }).then((ok) => ok && setAsking(false))}
                disabled={sending}
                className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send deletion request"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
