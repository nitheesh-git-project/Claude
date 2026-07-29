"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginCard() {
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
    router.push("/admin/dashboard");
    router.refresh();
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
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </section>
  );
}
