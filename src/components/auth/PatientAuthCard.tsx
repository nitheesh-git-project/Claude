"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { checkReferralCode, type ReferralCodeCheck } from "@/lib/checkReferralCode";

export default function PatientAuthCard() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [referralCheck, setReferralCheck] = useState<ReferralCodeCheck>({
    status: "idle",
  });
  const router = useRouter();
  const supabase = createClient();

  async function handleReferralCodeBlur(e: React.FocusEvent<HTMLInputElement>) {
    const code = e.target.value;
    if (!code.trim()) {
      setReferralCheck({ status: "idle" });
      return;
    }
    setReferralCheck({ status: "checking" });
    setReferralCheck(await checkReferralCode(code));
  }

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
    router.push("/patient/dashboard");
    router.refresh();
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
    const referralCode = (formData.get("referralCode") as string)?.trim();

    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords do not match. Please re-enter them.");
      return;
    }

    if (referralCheck.status === "invalid") {
      setLoading(false);
      setError(
        "That referral code isn't recognized. Please double-check it or clear the field to continue without one."
      );
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "patient",
          full_name: fullName,
          phone,
          referral_code: referralCode || undefined,
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (!data.session) {
      setInfo("Account created! Check your email to confirm it, then sign in.");
      setTab("login");
      return;
    }

    router.push("/patient/dashboard");
    router.refresh();
  }

  return (
    <section className="py-12 max-w-md mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <h2 className="text-2xl font-bold text-slate-900 text-center">
          Patient Portal Login
        </h2>
        <p className="text-xs text-slate-500 text-center mt-1">
          Access your scheduled video sessions and rehabilitation plans
        </p>

        <div className="flex border-b border-slate-200 mt-6 mb-6">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 pb-2 font-bold text-xs ${
              tab === "login"
                ? "text-teal-700 border-b-2 border-teal-700"
                : "text-slate-400"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setTab("register")}
            className={`flex-1 pb-2 font-bold text-xs ${
              tab === "register"
                ? "text-teal-700 border-b-2 border-teal-700"
                : "text-slate-400"
            }`}
          >
            Register Account
          </button>
        </div>

        {error && (
          <div className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-3">
            {info}
          </div>
        )}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Email Address</label>
              <input
                type="email"
                name="email"
                required
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
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
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Email Address</label>
              <input
                type="email"
                name="email"
                required
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
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                Referral Code{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                name="referralCode"
                placeholder="e.g. from your hospital/clinic"
                onChange={() => setReferralCheck({ status: "idle" })}
                onBlur={handleReferralCodeBlur}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
              {referralCheck.status === "checking" && (
                <p className="text-slate-400 mt-1">Checking code...</p>
              )}
              {referralCheck.status === "valid" && (
                <p className="text-teal-700 font-semibold mt-1">
                  <i className="fa-solid fa-circle-check mr-1"></i>
                  Valid — referred by {referralCheck.hospitalName ?? "your partner hospital"}
                </p>
              )}
              {referralCheck.status === "invalid" && (
                <p className="text-red-600 font-semibold mt-1">
                  <i className="fa-solid fa-circle-exclamation mr-1"></i>
                  Code not recognized — double-check it or leave blank
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
