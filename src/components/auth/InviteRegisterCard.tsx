"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rateLimitNotice } from "@/lib/rateLimit";
import { payForAppointment } from "@/lib/razorpay";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_INR } from "@/lib/pricing";
import { isValidEmail } from "@/lib/validateEmail";
import ConfirmPasswordField from "./ConfirmPasswordField";
import EmailField from "./EmailField";
import PasswordField from "./PasswordField";

type Preview = {
  valid: boolean;
  patientName?: string;
  medicalIssue?: string;
  assignedSlotTime?: string | null;
  isPastSlot?: boolean;
  hospitalName?: string;
  therapistName?: string | null;
};

/**
 * Whether the link is good, bad, or **not yet known**.
 *
 * The third value is the whole point. `Preview.valid` is a boolean, so a
 * request that could not be answered -- a 429, a dropped connection, a 500 --
 * arrived as `valid: undefined`, read as falsy, and rendered
 * "Link Invalid or Already Used": a patient holding a perfectly good
 * registration link was told it had expired and sent to ring the hospital.
 *
 * That is the "a check that could not be run is not a check that came back
 * negative" rule, which this codebase already learned once with
 * `getAdminUser` collapsing three outcomes into `null`. A boolean cannot
 * carry three answers, so this does.
 */
type LinkState = "checking" | "valid" | "invalid" | "unknown";

export default function InviteRegisterCard() {
  const searchParams = useSearchParams();
  const token = searchParams.get("ref");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [linkState, setLinkState] = useState<LinkState>(token ? "checking" : "invalid");
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [recheckCount, setRecheckCount] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [concern, setConcern] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    // Deliberately no synchronous setState here: the initial state is already
    // "checking" when a token is present, and the Try again button puts it
    // back before bumping the counter that re-runs this. Setting it at the
    // top of an effect is the cascading render the lint rule catches.
    (async () => {
      try {
        const res = await fetch(
          `/api/patient/referral-preview?token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        // `res.ok` decides whether there is an answer at all; only then does
        // `valid` get to mean anything. Reading `valid` off a 429 is exactly
        // how a good link came to be called expired.
        if (!res.ok) {
          setLinkState("unknown");
          setRetryNotice(
            typeof data?.error === "string"
              ? rateLimitNotice(data.error, data?.retryAfterSeconds)
              : null
          );
          return;
        }

        const preview = (data ?? { valid: false }) as Preview;
        setPreview(preview);
        setLinkState(preview.valid ? "valid" : "invalid");
        if (preview.valid && preview.patientName) {
          setFullName(preview.patientName);
        }
      } catch {
        // A dropped connection says nothing about the link either.
        if (!cancelled) setLinkState("unknown");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, recheckCount]);

  // We could not ask. Never the invalid-link copy: that sentence tells
  // somebody their link is dead and sends them to the hospital that referred
  // them, which is an expensive thing to be wrong about.
  if (linkState === "unknown") {
    return (
      <section className="py-16 max-w-md mx-auto px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">
            We couldn&apos;t check your link
          </h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {retryNotice ??
              "Something went wrong at our end, not with your link. Please try again."}
          </p>
          <button
            type="button"
            onClick={() => {
              setLinkState("checking");
              setRetryNotice(null);
              setRecheckCount((n) => n + 1);
            }}
            className="mt-5 text-xs font-semibold px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!token || linkState === "checking") {
    return (
      <section className="py-16 max-w-md mx-auto px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
          {!token ? (
            <>
              <h1 className="text-xl font-bold text-slate-900">Invalid Link</h1>
              <p className="text-xs text-slate-500 mt-2">
                This registration link is missing or malformed. Please check
                the link you were sent, or contact us.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Checking your registration link...</p>
          )}
        </div>
      </section>
    );
  }

  if (linkState === "invalid") {
    return (
      <section className="py-16 max-w-md mx-auto px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">
            Link Invalid or Already Used
          </h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            This registration link has expired or already been used to
            create an account. Please contact the hospital that referred you,
            or reach out to us directly for a new link.
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
    setError(null);

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter them.");
      return;
    }

    setLoading(true);

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
      setError("Account created - please sign in from the Patient Login page.");
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
          You&apos;ve been referred for a virtual physical therapy session -
          set up your account and complete payment to confirm it.
        </p>

        {preview && preview.valid && (
          <div className="mt-4 bg-teal-50 border border-teal-100 rounded-xl p-3 text-xs text-teal-900 space-y-1">
            <p>
              Referred by <strong>{preview.hospitalName}</strong>
            </p>
            {preview.medicalIssue && (
              <p>
                Concern: <strong>{preview.medicalIssue}</strong>
              </p>
            )}
            {preview.therapistName && (
              <p>
                Therapist: <strong>{preview.therapistName}</strong>
              </p>
            )}
            {preview.assignedSlotTime && (
              <p>
                Scheduled for:{" "}
                <strong>
                  {formatSlotTime(preview.assignedSlotTime, "Asia/Kolkata")}
                </strong>
              </p>
            )}
          </div>
        )}

        {preview && preview.valid && preview.isPastSlot && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
            This scheduled time has already passed - you can still register and
            pay below, and the clinic will follow up to reschedule your session.
          </div>
        )}

        {error && (
          <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {appointmentId ? (
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 mb-4">
              Your account is ready - complete payment to confirm your
              session.
            </p>
            <button
              onClick={() => startPayment(appointmentId, concern)}
              disabled={loading}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
            >
              {loading
                ? "Please wait..."
                : `Pay ₹${SESSION_FEE_INR.toLocaleString("en-IN")} Now`}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-6">
            <label className="block">
              <span className="block font-semibold mb-1">Full Name</span>
              <input
                type="text"
                required
                maxLength={120}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
            </label>
            <EmailField value={email} onChange={setEmail} />
            <PasswordField
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              label={
                <>
                  Create Password{" "}
                  <span className="font-normal text-slate-500">(for portal access)</span>
                </>
              }
            />
            <ConfirmPasswordField
              password={password}
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
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
