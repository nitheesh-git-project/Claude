"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";

/**
 * Linking a mobile number to the sign-in account, so it can be used for
 * "Sign in with a phone code" and "Forgot password -> text me a code".
 * Supabase texts a code to the new number and only links it once that code
 * comes back (a verified phone change), so nobody can link a number they do
 * not hold.
 */
export default function PhoneSignInSetupCard({ verifiedPhone, suggestedPhone }: { verifiedPhone: string | null; suggestedPhone: string | null }) {
  const router = useRouter();
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(suggestedPhone ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  function e164(value: string): string {
    const digits = value.replace(/[^\d]/g, "");
    if (value.trim().startsWith("+")) return `+${digits}`;
    return digits.length === 10 ? `+91${digits}` : `+${digits}`;
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: sendError } = await supabase.auth.updateUser({ phone: e164(phone) });
    setBusy(false);
    if (sendError) {
      setError("We couldn't text that number. Check it has its country code, or try again in a minute.");
      return;
    }
    setSent(true);
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: e164(phone), token: code, type: "phone_change" });
    setBusy(false);
    if (verifyError) {
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    show("Your mobile number is linked. You can now sign in with a phone code.");
    setEditing(false);
    setSent(false);
    setCode("");
    router.refresh();
  }

  return (
    <div id="phone-sign-in" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6" data-testid="phone-sign-in-setup">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Sign in with your phone</h2>
      <p className="text-sm text-slate-600">
        {verifiedPhone
          ? `Linked: ${verifiedPhone}. You can sign in, or reset your password, with a code texted to it. Your email and password still work too.`
          : "Link your mobile number to sign in, or reset your password, with a code we text you. Your email and password still work too."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          {verifiedPhone ? "Change number" : "Link my number"}
        </button>
      ) : !sent ? (
        <form onSubmit={send} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="phone-sign-in-link" className="text-sm font-semibold text-slate-800">
              Mobile number
            </label>
            <input
              id="phone-sign-in-link"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <button type="submit" disabled={busy} className="min-h-[44px] rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            {busy ? "Sending..." : "Text me a code"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 hover:underline">
            Cancel
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="phone-sign-in-link-code" className="text-sm font-semibold text-slate-800">
              6-digit code sent to {phone}
            </label>
            <input
              id="phone-sign-in-link-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-center text-lg font-bold tracking-[0.4em]"
            />
          </div>
          <button type="submit" disabled={busy || code.length !== 6} className="min-h-[44px] rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            {busy ? "Checking..." : "Link number"}
          </button>
          <button type="button" onClick={() => setSent(false)} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 hover:underline">
            Change number
          </button>
        </form>
      )}
    </div>
  );
}
