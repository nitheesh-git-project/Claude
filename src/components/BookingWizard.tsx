"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment gateway."));
    document.body.appendChild(script);
  });
}

const CONCERNS = [
  "Lower Back Stiffness / Sciatica",
  "Post-Op Knee Replacement",
  "Shoulder Impingement",
  "Sports Injury",
  "Other",
];

function minDateTimeLocal(hoursAhead: number) {
  const d = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function BookingWizard() {
  const [step, setStep] = useState(1);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const [timezone, setTimezone] = useState("");
  const [slotDateTime, setSlotDateTime] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [concern, setConcern] = useState(CONCERNS[0]);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (data.user) {
          setIsLoggedIn(true);
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", data.user.id)
            .single();
          if (profile) {
            setFullName(profile.full_name);
            setEmail(profile.email);
          }
        }
      })
      .catch(() => {
        // Not logged in / session check failed — proceed as a guest booking.
      })
      .finally(() => setCheckingAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToStep2() {
    setError(null);
    if (!slotDateTime) {
      setError("Please select a preferred date and time.");
      return;
    }
    setStep(2);
  }

  function goToStep3() {
    setError(null);
    if (!isLoggedIn) {
      if (!fullName || !email || password.length < 6) {
        setError("Please fill in your name, email, and a password (min 6 characters).");
        return;
      }
    }
    if (!consent) {
      setError("Please agree to the telehealth consent terms to continue.");
      return;
    }
    setStep(3);
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    let userId: string;

    if (isLoggedIn) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setLoading(false);
        setError("Your session expired. Please refresh the page and try again.");
        return;
      }
      userId = data.user.id;
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role: "patient", full_name: fullName } },
      });
      if (signUpError) {
        setLoading(false);
        setError(signUpError.message);
        return;
      }
      if (!data.session || !data.user) {
        setLoading(false);
        setInfo(
          "Account created! Check your email to confirm it, then sign in and submit this booking again from your dashboard."
        );
        return;
      }
      userId = data.user.id;
    }

    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .insert({
        patient_id: userId,
        slot_time: new Date(slotDateTime).toISOString(),
        timezone,
        concern,
        notes,
        status: "requested",
      })
      .select("id")
      .single();

    if (apptError || !appointment) {
      setLoading(false);
      setError(apptError?.message ?? "Could not save your booking. Please try again.");
      return;
    }

    setAppointmentId(appointment.id);
    await startPayment(appointment.id);
  }

  async function startPayment(id: string) {
    setError(null);
    setLoading(true);

    try {
      await loadRazorpayScript();

      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: id }),
      });
      const orderData = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(orderData.error ?? "Could not start payment. Please try again.");
        return;
      }

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.orderId,
        name: "Dr. Pooja's Physio",
        description: concern,
        prefill: { name: fullName, email },
        theme: { color: "#0f766e" },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          setLoading(true);
          const verifyRes = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointmentId: id, ...response }),
          });
          setLoading(false);
          if (verifyRes.ok) {
            setDone(true);
          } else {
            setError(
              `Payment received but verification failed. Please contact us with payment ID ${response.razorpay_payment_id}.`
            );
          }
        },
        modal: {
          ondismiss: () => {
            setError("Payment was not completed. You can try again below.");
          },
        },
      });
      razorpay.open();
    } catch {
      setLoading(false);
      setError("Could not load the payment gateway. Please check your connection and try again.");
    }
  }

  const header = (
    <div className="bg-slate-900 text-white p-6">
      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
        {done || info ? "Booking" : `Step ${step} of 3`}
      </span>
      <h1 className="text-xl font-bold">
        Book Virtual Physical Therapy Session
      </h1>
      <p className="text-xs text-slate-300 mt-1">
        ₹1,999 INR • 1-Hour HD Video Call & Custom Rehab Plan
      </p>
    </div>
  );

  if (checkingAuth) {
    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
        {header}
        <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  if (info) {
    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
        {header}
        <div className="p-8 text-center">
          <i className="fa-solid fa-envelope-circle-check text-teal-600 text-4xl mb-4"></i>
          <h2 className="text-xl font-bold text-slate-900">Almost there</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{info}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
        {header}
        <div className="p-8 text-center">
          <i className="fa-solid fa-circle-check text-teal-600 text-4xl mb-4"></i>
          <h2 className="text-xl font-bold text-slate-900">Payment Confirmed</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Your session is booked and paid. We&apos;ll confirm your exact
            slot and send the video call link by email or WhatsApp shortly.
          </p>
          <Link
            href="/patient/dashboard"
            className="mt-6 inline-block bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-6 rounded-xl text-sm transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
      {header}
      <div className="p-8 space-y-5 text-sm">
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {step === 1 && (
        <>
          <div>
            <label className="block font-semibold mb-1.5 text-slate-900">
              Your Detected Timezone
            </label>
            <div className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 font-medium text-slate-700">
              {timezone || "Detecting..."}
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1.5 text-slate-900">
              Preferred Date & Time
              <span className="font-normal text-xs text-slate-500">
                {" "}
                (at least 12 hours from now)
              </span>
            </label>
            <input
              type="datetime-local"
              value={slotDateTime}
              min={minDateTimeLocal(12)}
              onChange={(e) => setSlotDateTime(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>
          <p className="text-xs text-slate-400">
            This is your preferred time — we&apos;ll confirm the exact slot
            with you before the session.
          </p>
          <button
            onClick={goToStep2}
            className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg flex justify-center items-center gap-2"
          >
            Continue to Medical Details <i className="fa-solid fa-arrow-right"></i>
          </button>
        </>
      )}

      {step === 2 && (
        <>
          {isLoggedIn ? (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-xs text-teal-800">
              Booking as <strong>{fullName}</strong> ({email})
            </div>
          ) : (
            <>
              <div>
                <label className="block font-semibold mb-1.5 text-slate-900">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full p-3 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1.5 text-slate-900">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full p-3 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1.5 text-slate-900">
                    Password{" "}
                    <span className="font-normal text-slate-500 text-xs">
                      (for portal access)
                    </span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    className="w-full p-3 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Already have an account?{" "}
                <Link href="/patient/login" className="text-teal-700 font-semibold">
                  Sign in first
                </Link>{" "}
                so this booking links to it.
              </p>
            </>
          )}

          <div>
            <label className="block font-semibold mb-1.5 text-slate-900">
              Primary Concern
            </label>
            <select
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 bg-white"
            >
              {CONCERNS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1.5 text-slate-900">
              Anything else we should know?{" "}
              <span className="font-normal text-slate-500 text-xs">
                (optional)
              </span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Briefly describe your pain, injury, or goals"
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </div>

          <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 w-4 h-4 accent-teal-600"
            />
            <label className="text-xs text-slate-700 leading-relaxed font-medium">
              I agree to the Telehealth Consent Terms & Emergency Disclaimer. I
              understand virtual physical therapy is for non-emergency
              musculoskeletal care.
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setStep(1)}
              className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3.5 rounded-xl transition"
            >
              Back
            </button>
            <button
              onClick={goToStep3}
              className="w-2/3 bg-teal-700 hover:bg-teal-800 text-white font-bold py-3.5 rounded-xl transition shadow-lg"
            >
              Review Booking →
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="bg-teal-50 p-5 rounded-2xl border border-teal-100 space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Name</span>
              <span className="font-bold text-slate-900">{fullName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Email</span>
              <span className="font-bold text-slate-900">{email}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Preferred Time</span>
              <span className="font-bold text-slate-900">
                {slotDateTime && new Date(slotDateTime).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Concern</span>
              <span className="font-bold text-slate-900">{concern}</span>
            </div>
            <div className="flex justify-between text-xs pt-3 border-t border-teal-100">
              <span className="text-slate-500">Session Fee</span>
              <span className="font-bold text-slate-900">₹1,999 INR</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            <i className="fa-solid fa-lock text-teal-600 mr-1"></i>
            Secure payment via Razorpay. Your slot is held once payment is
            confirmed.
          </p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setStep(2)}
              disabled={loading || !!appointmentId}
              className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3.5 rounded-xl transition disabled:opacity-60"
            >
              Back
            </button>
            <button
              onClick={appointmentId ? () => startPayment(appointmentId) : handleSubmit}
              disabled={loading}
              className="w-2/3 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition shadow-lg"
            >
              {loading
                ? "Please wait..."
                : appointmentId
                ? "Pay ₹1,999 Now"
                : "Request Booking"}
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
