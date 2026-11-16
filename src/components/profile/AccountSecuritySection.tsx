"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordField from "@/components/auth/PasswordField";
import ConfirmPasswordField from "@/components/auth/ConfirmPasswordField";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordChange";
import { rateLimitNotice } from "@/lib/rateLimit";

/**
 * Account security, the same on all four profiles: change the password
 * (needs the current one, checked by the server), or -- for somebody who no
 * longer knows it -- the reset link by email, which needs nothing but the
 * inbox. Two doors, said plainly, so neither reads as the other.
 */
export default function AccountSecuritySection({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const currentId = useId();

  async function handleChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setChangeError(null);
    if (!current) {
      setChangeError("Enter your current password.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setChangeError(`The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setChangeError("The two new passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeError(
          res.status === 429
            ? rateLimitNotice(data.error ?? "That is several password checks in a row.", data.retryAfterSeconds)
            : data.error ?? "Could not change your password. Please try again."
        );
        return;
      }
      // An admin-issued temporary password stops being shown once the
      // person has set their own, as after a reset. Best effort.
      await fetch("/api/clear-temp-password", { method: "POST" }).catch(() => {});
      setChanged(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setChangeError("Could not reach the server. Your password was not changed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendReset() {
    setSending(true);
    setResetError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) {
      setResetError("Could not send the reset email. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="space-y-5 text-xs" data-testid="account-security">
      <p>
        <span className="text-slate-500">Signed in as</span>{" "}
        <span className="font-semibold text-slate-700">{email}</span>
      </p>

      <form onSubmit={handleChange} className="space-y-3 rounded-xl border border-slate-200 p-4" noValidate>
        <h3 className="font-semibold text-slate-800">Change password</h3>
        {changed && (
          <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-teal-800">
            Your password is changed. Use the new one next time you sign in.
          </p>
        )}
        {changeError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
            {changeError}
          </p>
        )}
        <div>
          <label htmlFor={currentId} className="mb-1 block font-semibold">
            Current password
          </label>
          <PasswordInput
            id={currentId}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setChanged(false);
            }}
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-300 p-3"
          />
        </div>
        <PasswordField value={next} onChange={setNext} label="New password" autoComplete="new-password" />
        <ConfirmPasswordField password={next} value={confirm} onChange={setConfirm} label="Confirm new password" />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {saving ? "Changing…" : "Change password"}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-slate-600">
          <span className="font-semibold text-slate-800">Forgot your current password?</span> We&apos;ll email you a
          link to set a new one - no current password needed.
        </p>
        {resetError && <p className="text-red-600">{resetError}</p>}
        {sent ? (
          <p className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-teal-700">
            Check your inbox - we&apos;ve sent a link to {email} to set a new password.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleSendReset}
            disabled={sending}
            className="rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {sending ? "Sending..." : "Email me a reset link"}
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        To change your email address, please contact us - this keeps your sign-in secure.
      </p>
    </div>
  );
}
