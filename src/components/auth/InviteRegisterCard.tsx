"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InviteRegisterCard() {
  const searchParams = useSearchParams();
  const token = searchParams.get("ref");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  if (!token) {
    return (
      <section className="py-16 max-w-md mx-auto px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">Invalid Link</h1>
          <p className="text-xs text-slate-500 mt-2">
            This registration link is missing or malformed. Please check the
            link you were sent, or contact us.
          </p>
        </div>
      </section>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/patient/register-via-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fullName, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Could not complete registration. Please try again.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError("Account created — please sign in from the Patient Login page.");
      return;
    }
    router.push("/patient/dashboard");
    router.refresh();
  }

  return (
    <section className="py-16 max-w-md mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <h1 className="text-xl font-bold text-slate-900 text-center">
          Complete Your Registration
        </h1>
        <p className="text-xs text-slate-500 text-center mt-1">
          You&apos;ve been referred for a virtual physical therapy session —
          set up your account to continue.
        </p>

        {error && (
          <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-6">
          <div>
            <label className="block font-semibold mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
          >
            {loading ? "Creating account..." : "Complete Registration"}
          </button>
        </form>
      </div>
    </section>
  );
}
