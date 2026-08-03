"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TherapistAuthCard() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Hard navigation so the fresh cookies set by signInWithPassword are
    // guaranteed to be sent with the very next request to the proxy.
    window.location.href = "/therapist/dashboard";
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setForgotSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotSubmitting(false);
    setForgotSent(true);
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    const fullName = formData.get("fullName") as string;
    const phone = formData.get("phone") as string;
    const credentials = formData.get("credentials") as string;

    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords do not match. Please re-enter them.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: "therapist", full_name: fullName, phone, credentials },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (!data.session) {
      setInfo("Application submitted! Check your email to confirm your account, then sign in.");
      setTab("login");
      return;
    }

    window.location.href = "/pending-approval";
  }

  return (
    <section className="py-12 max-w-md mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <h2 className="text-2xl font-bold text-slate-900 text-center">
          Therapist Portal
        </h2>
        <p className="text-xs text-slate-500 text-center mt-1">
          Log in to your dashboard or apply to join the network
        </p>

        <div className="flex border-b border-slate-200 mt-6 mb-6">
          <button
            onClick={() => {
              setTab("login");
              setForgotMode(false);
            }}
            className={`flex-1 pb-2 font-bold text-xs ${
              tab === "login"
                ? "text-purple-700 border-b-2 border-purple-700"
                : "text-slate-400"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setTab("register");
              setForgotMode(false);
            }}
            className={`flex-1 pb-2 font-bold text-xs ${
              tab === "register"
                ? "text-purple-700 border-b-2 border-purple-700"
                : "text-slate-400"
            }`}
          >
            Apply to Join
          </button>
        </div>

        {error && (
          <div className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg p-3">
            {info}
          </div>
        )}

        {tab === "login" && forgotMode ? (
          forgotSent ? (
            <div className="text-xs space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-purple-800">
                If an account exists for that email, we&apos;ve sent a
                password reset link. Check your inbox (and spam folder).
              </div>
              <button
                onClick={() => {
                  setForgotMode(false);
                  setForgotSent(false);
                }}
                className="text-purple-700 font-semibold hover:underline"
              >
                ← Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 text-xs">
              <p className="text-slate-500">
                Enter your account email and we&apos;ll send you a link to
                reset your password.
              </p>
              <div>
                <label className="block font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  className="w-full p-3 rounded-xl border border-slate-300"
                />
              </div>
              <button
                type="submit"
                disabled={forgotSubmitting}
                className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
              >
                {forgotSubmitting ? "Sending..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                onClick={() => setForgotMode(false)}
                className="w-full text-slate-500 font-semibold"
              >
                ← Back to Sign In
              </button>
            </form>
          )
        ) : tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Email Address</label>
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                maxLength={72}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
              <button
                type="button"
                onClick={() => setForgotMode(true)}
                className="text-purple-700 font-semibold mt-1.5 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold mb-1">Full Name</label>
              <input
                type="text"
                name="fullName"
                required
                maxLength={120}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Email Address</label>
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                WhatsApp / Phone
              </label>
              <input
                type="tel"
                name="phone"
                inputMode="tel"
                maxLength={20}
                onInput={(e) => {
                  e.currentTarget.value = e.currentTarget.value.replace(
                    /[^0-9+\-\s()]/g,
                    ""
                  );
                }}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                Qualifications & License / Council Reg No.
              </label>
              <input
                type="text"
                name="credentials"
                placeholder="e.g. BPT, MPT — Council Reg: PT-XXXXXX"
                required
                maxLength={200}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                Create Password{" "}
                <span className="font-normal text-slate-400">
                  (for portal access)
                </span>
              </label>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                maxLength={72}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={6}
                maxLength={72}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
