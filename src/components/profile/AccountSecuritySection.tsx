"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AccountSecuritySection({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSendReset() {
    setSending(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (resetError) {
      setError("Could not send the reset email. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="text-xs space-y-3">
      <p>
        <span className="text-slate-400">Email:</span>{" "}
        <span className="font-semibold text-slate-700">{email}</span>
      </p>
      {error && <p className="text-red-600">{error}</p>}
      {sent ? (
        <p className="text-teal-700 bg-teal-50 border border-teal-200 rounded-lg p-3">
          Check your inbox — we&apos;ve sent a link to {email} to set a new
          password.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleSendReset}
          disabled={sending}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition"
        >
          {sending ? "Sending..." : "Send Password Reset Email"}
        </button>
      )}
      <p className="text-[11px] text-slate-400">
        To change your email address, please contact us — this keeps your
        sign-in secure.
      </p>
    </div>
  );
}
