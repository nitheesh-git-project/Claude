"use client";

import { useState } from "react";

// "Sign in with a phone code" (and Forgot password -> "text me a code"), the
// same two steps on the patient, therapist and hospital sign-in cards. Drawn
// only while an admin has phone sign-in switched on (the page reads it on the
// server). Never on the admin sign-in page. Rules: src/lib/phoneLogin.ts.
//
// The routes answer neutrally, so this never says whether a number has an
// account: after "Send code" it always moves on to the code step.

const RECOVERY_MARK = "mr-recovery-for";

const INPUT = "w-full p-3 rounded-xl border border-slate-300";
const PRIMARY = "w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition";

export default function PhoneCodeSignIn({
  purpose,
  onCancel,
  cancelLabel = "Use email and password instead",
}: {
  purpose: "signin" | "reset";
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function call(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { res, data };
  }

  async function sendCode(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { res, data } = await call("/api/auth/phone/send", { phone });
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "We couldn't send a code just now. Please try again.");
        return;
      }
      setNotice(typeof data?.message === "string" ? data.message : null);
      setStep("code");
    } catch {
      setError("We couldn't send a code - check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { res, data } = await call("/api/auth/phone/verify", { phone, code, purpose });
      if (!res.ok) {
        setBusy(false);
        setError(typeof data?.error === "string" ? data.error : "That code didn't work. Please try again.");
        return;
      }
      if (purpose === "reset" && typeof data?.userId === "string") {
        // /reset-password shows its form to a session that came from a reset;
        // this is that mark, the same one an emailed reset link sets.
        try {
          window.sessionStorage.setItem(RECOVERY_MARK, data.userId);
        } catch {
          // Without storage the reset page asks for the email link instead.
        }
      }
      // Hard navigation, so the new session cookies go with the next request.
      window.location.href = typeof data?.next === "string" ? data.next : "/dashboard";
    } catch {
      setBusy(false);
      setError("We couldn't check the code - check your connection and try again.");
    }
  }

  return (
    <div className="space-y-4 text-sm" data-testid="phone-code-sign-in">
      {error && (
        <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}
      {step === "phone" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <p className="text-slate-600">
            {purpose === "reset"
              ? "We'll text a 6-digit code to the mobile number linked to your account. Then you choose a new password."
              : "We'll text a 6-digit code to the mobile number linked to your account."}
          </p>
          <div>
            <label htmlFor="phone-sign-in-number" className="block font-semibold text-slate-700 mb-1">
              Mobile number
            </label>
            <input
              id="phone-sign-in-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className={INPUT}
            />
          </div>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Sending..." : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {notice && (
            <p role="status" className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-3">
              {notice}
            </p>
          )}
          <div>
            <label htmlFor="phone-sign-in-code" className="block font-semibold text-slate-700 mb-1">
              6-digit code
            </label>
            <input
              id="phone-sign-in-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${INPUT} text-center text-xl tracking-[0.5em] font-bold`}
            />
          </div>
          <button type="submit" disabled={busy || code.length !== 6} className={PRIMARY}>
            {busy ? "Checking..." : purpose === "reset" ? "Verify code" : "Verify and sign in"}
          </button>
          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => void sendCode()} disabled={busy} className="min-h-[44px] text-teal-700 font-semibold hover:underline">
              Send a new code
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
              className="min-h-[44px] text-slate-600 font-semibold hover:underline"
            >
              Change number
            </button>
          </div>
        </form>
      )}
      <button type="button" onClick={onCancel} className="w-full min-h-[44px] text-slate-600 font-semibold hover:underline">
        {cancelLabel}
      </button>
    </div>
  );
}
