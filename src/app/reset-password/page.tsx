"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmPasswordField from "@/components/auth/ConfirmPasswordField";

const ROLE_LOGIN_HREF: Record<string, string> = {
  patient: "/patient/login",
  therapist: "/therapist/login",
  admin: "/admin/login",
  hospital: "/hospital/login",
};

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
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
      // fragment (already picked up automatically by detectSessionInUrl) —
      // handle both so this works regardless of the project's auth flow
      // setting.
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setHasSession(!!user);
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

    // Best-effort — an admin-issued temp password (if any) should stop
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
        ) : !hasSession ? (
          <div className="mt-6 text-xs space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
              This reset link is invalid or has expired. Please request a new
              one from the sign-in page.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-6">
            {error && (
              <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <div>
              <label className="block font-semibold mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
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
