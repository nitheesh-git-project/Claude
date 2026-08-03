"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TherapistAuthCard() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
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
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/therapist/dashboard");
    router.refresh();
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("fullName") as string;
    const phone = formData.get("phone") as string;
    const credentials = formData.get("credentials") as string;

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        role: "therapist",
        full_name: fullName,
        email,
        phone,
        credentials,
        approved: false,
      });
      if (profileError) {
        setLoading(false);
        setError(profileError.message);
        return;
      }
    }

    setLoading(false);
    router.push("/pending-approval");
    router.refresh();
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
            onClick={() => setTab("login")}
            className={`flex-1 pb-2 font-bold text-xs ${
              tab === "login"
                ? "text-purple-700 border-b-2 border-purple-700"
                : "text-slate-400"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setTab("register")}
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
                Qualifications & License / Council Reg No.
              </label>
              <input
                type="text"
                name="credentials"
                placeholder="e.g. BPT, MPT — Council Reg: PT-XXXXXX"
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
                minLength={6}
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
