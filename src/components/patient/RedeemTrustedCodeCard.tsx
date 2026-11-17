"use client";

import { useId, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { rateLimitNotice } from "@/lib/rateLimit";

/**
 * A trusted-patient code the clinic gave this patient: entering it turns on
 * pay later for their account (/api/patient/redeem-trusted-code). Shown on
 * Payments only while the clinic offers pay later and the account is not on
 * it already. Says nothing about how the code is checked.
 */
export default function RedeemTrustedCodeCard() {
  const router = useRouter();
  const inputId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the code the clinic gave you.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/redeem-trusted-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 429
            ? rateLimitNotice(data.error ?? "That is several codes tried in a row.", data.retryAfterSeconds)
            : data.error ?? "Could not use the code. Please try again."
        );
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900" data-testid="trusted-code-redeemed">
        Pay later is on for your account. You can book an online session now and settle after it.
      </p>
    );
  }

  return (
    <form onSubmit={redeem} className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="redeem-trusted-code">
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-900">
        Have a trusted-patient code from the clinic?
      </label>
      <p className="mt-1 text-xs text-slate-500">Enter it to pay for your sessions after they happen.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          id={inputId}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="TRUST-XXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 font-mono text-sm uppercase"
        />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Checking…" : "Use code"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
