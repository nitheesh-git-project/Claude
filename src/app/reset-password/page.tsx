"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmPasswordField from "@/components/auth/ConfirmPasswordField";
import PasswordField from "@/components/auth/PasswordField";

const ROLE_LOGIN_HREF: Record<string, string> = {
  patient: "/patient/login",
  therapist: "/therapist/login",
  admin: "/admin/login",
  hospital: "/hospital/login",
};

// Set in this tab once a reset link has been exchanged here, so a refresh
// mid-form keeps the form (the link itself is single-use and spent).
const RECOVERY_MARK = "mr-recovery-for";

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  // The form is for somebody who arrived through a reset link. A signed-in
  // person typing this address got it too, and could set a new password
  // without ever giving the current one -- that is Change password on the
  // profile, which asks for it.
  const [fromLink, setFromLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loginHref, setLoginHref] = useState("/patient/login");
  const supabase = createClient();

  useEffect(() => {
    async function establishSession() {
      // Supabase's password-reset email can land here either as a PKCE
      // "?code=" param (needs exchanging) or an implicit "#access_token="
      // fragment (already picked up automatically by detectSessionInUrl) -
      // handle both so this works regardless of the project's auth flow
      // setting.
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      // A one-time link an admin issued (src/lib/accessLink.ts) carries the
      // recovery token itself; the patient-initiated "forgot password" email
      // carries a PKCE code. Either opens the same session.
      const tokenHash = url.searchParams.get("token_hash");
      // The implicit flow's fragment says what kind of link it was.
      const hashSaysRecovery = /(^|[#&])type=recovery(&|$)/.test(window.location.hash);
      let exchanged = false;
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        exchanged = !error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        exchanged = !error;
      }
      if (tokenHash || code || hashSaysRecovery) {
        // Single-use either way; keep it out of history and screenshots.
        window.history.replaceState(null, "", url.pathname);
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let marked = false;
      try {
        if (user && (exchanged || hashSaysRecovery)) window.sessionStorage.setItem(RECOVERY_MARK, user.id);
        marked = !!user && window.sessionStorage.getItem(RECOVERY_MARK) === user.id;
      } catch {
        marked = !!user && (exchanged || hashSaysRecovery);
      }
      setHasSession(!!user);
      setFromLink(marked);
      setChecking(false);
    }
    establishSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    // Best-effort - an admin-issued temp password (if any) should stop
    // being shown once the user has set their own; not fatal if this fails.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let role = "patient";
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      role = profile?.role ?? "patient";
    }
    await fetch("/api/clear-temp-password", { method: "POST" }).catch(() => {});

    setLoginHref(ROLE_LOGIN_HREF[role] ?? "/patient/login");
    try {
      window.sessionStorage.removeItem(RECOVERY_MARK);
    } catch {
      // Storage unavailable: nothing was kept.
    }
    setSubmitting(false);
    setDone(true);
    await supabase.auth.signOut();
  }

  return (
    <section className="py-16 max-w-md mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <h1 className="text-xl font-bold text-slate-900 text-center">
          Set a New Password
        </h1>

        {checking ? (
          <p className="text-xs text-slate-500 text-center mt-6">Verifying your link...</p>
        ) : done ? (
          <div className="mt-6 text-xs space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-800">
              Your password has been updated. You can now sign in with it.
            </div>
            <a
              href={loginHref}
              className="block w-full text-center bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl transition"
            >
              Go to Sign In
            </a>
          </div>
        ) : hasSession && !fromLink ? (
          <div className="mt-6 text-xs space-y-3" data-testid="reset-not-from-link">
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
              You are signed in. To change your password, use <strong>Change password</strong> on your profile -
              it asks for your current one. Forgotten it? The same section emails you a reset link.
            </p>
            <a
              href="/dashboard"
              className="block w-full text-center bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl transition"
            >
              Go to my dashboard
            </a>
          </div>
        ) : !hasSession ? (
          <div className="mt-6 text-xs space-y-3" data-testid="reset-not-from-link">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
              This page opens from the link in a password reset email. If you followed one, it has expired or was
              already used - ask for a new one with <strong>Forgot password?</strong> on the sign-in page.
            </div>
            {/* The hub, not one portal: this page serves all four roles. */}
            <a
              href="/get-started"
              className="block w-full text-center bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl transition"
            >
              Go to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-6">
            {error && (
              <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <PasswordField
              value={password}
              onChange={setPassword}
              label="New Password"
              autoComplete="new-password"
            />
            <ConfirmPasswordField
              password={password}
              value={confirmPassword}
              onChange={setConfirmPassword}
              label="Confirm New Password"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
            >
              {submitting ? "Saving..." : "Set New Password"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
