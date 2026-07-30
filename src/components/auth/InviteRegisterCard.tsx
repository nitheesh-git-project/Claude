"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { payForAppointment } from "@/lib/razorpay";

export default function InviteRegisterCard() {
  const searchParams = useSearchParams();
  const token = searchParams.get("ref");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [concern, setConcern] = useState("");
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

  async function startPayment(id: string, description: string) {
    setError(null);
    setLoading(true);
    await payForAppointment({
      appointmentId: id,
      name: fullName,
      email,
      description,
      onSuccess: () => {
        setLoading(false);
        setDone(true);
      },
      onError: (message) => {
        setLoading(false);
        setError(message);
      },
      onDismiss: () => {
        setLoading(false);
        setError("Payment was not completed. You can try again below.");
      },
    });
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
    if (signInError) {
      setLoading(false);
      setError("Account created — please sign in from the Patient Login page.");
      return;
    }

    setAppointmentId(data.appointmentId);
    setConcern(data.concern ?? "Virtual Physical Therapy Session");
    await startPayment(data.appointmentId, data.concern ?? "Virtual Physical Therapy Session");
  }

  if (done) {
    return (
      <section className="py-16 max-w-md mx-auto px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
          <i className="fa-solid fa-circle-check text-teal-600 text-4xl mb-4"></i>
          <h1 className="text-xl font-bold text-slate-900">Payment Confirmed</h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Your account is set up and your session is booked and paid.
            We&apos;ll send the video call link by email or WhatsApp shortly.
          </p>
          <Link
            href="/patient/dashboard"
            className="mt-6 inline-block bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-6 rounded-xl text-sm transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 max-w-md mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <h1 className="text-xl font-bold text-slate-900 text-center">
          Complete Your Registration
        </h1>
        <p className="text-xs text-slate-500 text-center mt-1">
          You&apos;ve been referred for a virtual physical therapy session —
          set up your account and complete payment to confirm it.
        </p>

        {error && (
          <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {appointmentId ? (
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 mb-4">
              Your account is ready — complete payment to confirm your
              session.
            </p>
            <button
              onClick={() => startPayment(appointmentId, concern)}
              disabled={loading}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? "Please wait..." : "Pay ₹1,999 Now"}
            </button>
          </div>
        ) : (
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
              {loading ? "Creating account..." : "Continue to Payment"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
