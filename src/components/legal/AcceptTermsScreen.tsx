"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignOutButton from "@/components/auth/SignOutButton";
import { formatEffectiveDate } from "@/lib/legal/legalDocs";

/**
 * The full-page "Agree to continue" a dashboard shows in place of itself
 * (TermsGate). One tick box, one button; the links open the pages in a new
 * tab so the person does not lose this screen. Nothing is assumed: the
 * button stays disabled until the box is ticked, and a failed save says so
 * and keeps them here rather than letting them in unrecorded.
 */
export default function AcceptTermsScreen({ version, firstTime }: { version: string; firstTime: boolean }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = formatEffectiveDate(version);

  async function accept() {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        // A newer version came into force while this screen was open.
        router.refresh();
        return;
      }
      if (!res.ok) {
        setError(body.error ?? "We couldn't save that just now. Please try again.");
        setSaving(false);
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-10">
      <section
        aria-labelledby="accept-terms-title"
        className="w-full max-w-md rounded-[28px] bg-white px-6 pb-6 pt-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
      >
        <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
        </span>
        <h1 id="accept-terms-title" className="mt-4 font-display text-2xl font-extrabold text-slate-900">
          {firstTime ? "Before you continue" : "We've updated our Terms"}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          {firstTime
            ? "Please read and agree to our Terms of use and Privacy policy to use your account."
            : `Our Terms of use and Privacy policy changed${date ? ` on ${date}` : ""}. Please read them and agree to continue.`}
        </p>
        <ul className="mt-4 flex justify-center gap-5 text-sm">
          <li>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-teal-700 underline underline-offset-2">
              Terms of use<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
          <li>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-teal-700 underline underline-offset-2">
              Privacy policy<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left">
          <input
            id="accept-terms-box"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-none accent-teal-700"
          />
          <span className="text-sm leading-relaxed text-slate-800">
            I have read and agree to the Terms of use and Privacy policy.
          </span>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={accept}
          disabled={!agreed || saving}
          className="mt-4 min-h-[54px] w-full rounded-full bg-teal-700 text-[17px] font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          {saving ? "Saving…" : "Agree and continue"}
        </button>
        <div className="mt-3 flex justify-center">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
