"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Deliberately no pre-auth "forgot password?" link here (unlike the
// patient/therapist/hospital login cards) -- the admin portal isn't
// public-facing self-serve, and a locked-out admin's blast radius is
// higher, so recovery goes through another admin (see AdminFeatureControlTab's
// Account Security section, for a logged-in admin resetting their own
// password) or direct Supabase dashboard access, not an unauthenticated
// email link.
export default function AdminLoginCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    // Left in the loading state deliberately -- a hard navigation is about
    // to replace this page, so resetting it first just flashes the button
    // back to "Sign In" for however long that navigation takes. Hard nav,
    // not router.push — a client-side soft nav can race the just-set auth
    // cookies, so the proxy's next check reads a stale session and bounces
    // back to /admin/login without ever showing an error, leaving the
    // button looking like it silently failed.
    window.location.href = "/admin/dashboard";
  }

  return (
    <section className="py-16 max-w-md mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-14 h-14 bg-slate-800 text-white rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-shield-halved"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900 text-center">
          Admin Login
        </h1>
        <p className="text-xs text-slate-500 text-center mt-1">
          Restricted access — authorized administrators only
        </p>

        {error && (
          <div className="mt-6 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs mt-6">
          <div>
            <label htmlFor="admin-login-email" className="block font-semibold mb-1">
              Email Address
            </label>
            <input
              id="admin-login-email"
              type="email"
              name="email"
              autoComplete="username"
              required
              maxLength={254}
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>
          <div>
            <label htmlFor="admin-login-password" className="block font-semibold mb-1">
              Password
            </label>
            <input
              id="admin-login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={72}
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </section>
  );
}
