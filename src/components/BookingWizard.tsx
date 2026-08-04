"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { payForAppointment } from "@/lib/razorpay";
import { checkReferralCode, type ReferralCodeCheck } from "@/lib/checkReferralCode";
import { BASE_DURATION_MINUTES, CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { AVAILABILITY_HOURS, formatHourRange } from "@/lib/therapistAvailability";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import PhoneNumberField from "@/components/PhoneNumberField";
import ConfirmPasswordField from "@/components/auth/ConfirmPasswordField";

type Category = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes: number;
};

function todayDateStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function BookingWizard() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  // Lazy initializer, not a bare Date.now() in the render body -- same
  // one-time-"now" pattern already used elsewhere in this codebase (see
  // ProfileSessionList) for grey-out logic that only needs to be roughly
  // fresh, not tick-perfect.
  const [nowMs] = useState(() => Date.now());
  const [timezone, setTimezone] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookHour, setBookHour] = useState<number | "">("");
  const slotDateTime =
    bookDate && bookHour !== "" ? `${bookDate}T${String(bookHour).padStart(2, "0")}:00` : "";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralCheck, setReferralCheck] = useState<ReferralCodeCheck>({
    status: "idle",
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [previousTherapists, setPreviousTherapists] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [preferredTherapistId, setPreferredTherapistId] = useState("");

  const supabase = createClient();
  const selectedCategory = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    // Reads the browser's detected timezone, which is only known once
    // mounted on the client — there's no way to get this during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          // Best-effort "book with the same therapist again" — a fresh
          // account or a fetch failure just means the option doesn't show.
          fetch("/api/patient/previous-therapists")
            .then((res) => (res.ok ? res.json() : { therapists: [] }))
            .then((data) => setPreviousTherapists(data.therapists ?? []))
            .catch(() => {});
        }
      })
      .catch(() => {
        // Not logged in / session check failed — proceed as a guest booking.
      })
      .finally(() => setCheckingAuth(false));

    (async () => {
      const { data } = await supabase
        .from("treatment_categories")
        .select("id, title, price_paise, duration_minutes")
        .eq("active", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });
      const list = data ?? [];
      setCategories(list);
      // Only preselect when the patient arrived via a specific "Book X"
      // link from the Conditions page — that's a deliberate choice. Never
      // default to the first category in the list just because one
      // exists; since each one can carry a different price now, silently
      // picking one for the patient risks booking (and charging) them for
      // a concern they never actually chose.
      const fromQuery = searchParams.get("category");
      const preselect = list.find((c) => c.id === fromQuery);
      setCategoryId(preselect?.id ?? "");
      setCategoriesLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToStep2() {
    setError(null);
    if (!bookDate || bookHour === "") {
      setError("Please select a preferred date and time.");
      return;
    }
    if (new Date(slotDateTime).getTime() < Date.now() + 12 * 60 * 60 * 1000) {
      setError("Please choose a time at least 12 hours from now.");
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!isValidStoredPhone(phone)) {
        setError("Please enter a valid phone number.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please re-enter them.");
        return;
      }
      if (referralCheck.status === "invalid") {
        setError(
          "That referral code isn't recognized. Please double-check it or clear the field to continue without one."
        );
        return;
      }
    }
    if (!categoryId) {
      setError("Please select what you'd like help with.");
      return;
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
        options: {
          data: {
            role: "patient",
            full_name: fullName,
            phone,
            referral_code: referralCode.trim() || undefined,
          },
        },
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

    const newDuration = selectedCategory?.duration_minutes ?? BASE_DURATION_MINUTES;
    const newStart = new Date(slotDateTime).getTime();
    const newEnd = newStart + newDuration * 60_000;
    const { data: existingBookings } = await supabase
      .from("appointments")
      .select("slot_time, duration_minutes")
      .eq("patient_id", userId)
      .in("status", ["requested", "confirmed"]);
    const overlaps = (existingBookings ?? []).some((a) => {
      if (!a.slot_time) return false;
      const existingStart = new Date(a.slot_time).getTime();
      const existingEnd = existingStart + (a.duration_minutes ?? BASE_DURATION_MINUTES) * 60_000;
      return existingStart < newEnd && newStart < existingEnd;
    });
    if (overlaps) {
      setLoading(false);
      setError(
        "You already have a session scheduled around this time. Please pick a different slot, or check your dashboard for existing bookings."
      );
      return;
    }

    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .insert({
        patient_id: userId,
        slot_time: new Date(slotDateTime).toISOString(),
        timezone,
        concern: selectedCategory?.title ?? "General Consultation",
        category_id: categoryId || null,
        duration_minutes: selectedCategory?.duration_minutes ?? BASE_DURATION_MINUTES,
        notes,
        preferred_therapist_id: preferredTherapistId || null,
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
    await payForAppointment({
      appointmentId: id,
      name: fullName,
      email,
      description: selectedCategory?.title ?? "Virtual Physical Therapy Session",
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

  const header = (
    <div className="bg-slate-900 text-white p-6">
      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
        {done || info ? "Booking" : `Step ${step} of 3`}
      </span>
      <h1 className="text-xl font-bold">
        Book Virtual Physical Therapy Session
      </h1>
      <p className="text-xs text-slate-300 mt-1">
        {selectedCategory
          ? `${formatInr(selectedCategory.price_paise)} INR • ${
              selectedCategory.duration_minutes
            }-Min HD Video Call & Custom Rehab Plan`
          : "HD Video Call & Custom Rehab Plan — pricing shown once you pick a concern"}
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
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={bookDate}
                min={todayDateStr()}
                onChange={(e) => setBookDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300"
              />
              <select
                aria-label="Preferred time"
                value={bookHour}
                onChange={(e) => setBookHour(e.target.value ? Number(e.target.value) : "")}
                className="w-full p-3 rounded-xl border border-slate-300 bg-white"
              >
                <option value="" disabled>
                  — Time —
                </option>
                {AVAILABILITY_HOURS.map((hour) => {
                  const tooSoon =
                    bookDate &&
                    new Date(`${bookDate}T${String(hour).padStart(2, "0")}:00`).getTime() <
                      nowMs + 12 * 60 * 60 * 1000;
                  return (
                    <option key={hour} value={hour} disabled={!!tooSoon}>
                      {formatHourRange(hour)}
                      {tooSoon ? " (too soon)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
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
                    Create Password{" "}
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
              <PhoneNumberField
                value={phone}
                onChange={setPhone}
                labelClassName="block font-semibold mb-1.5 text-slate-900"
              />
              <ConfirmPasswordField
                password={password}
                value={confirmPassword}
                onChange={setConfirmPassword}
                labelClassName="block font-semibold mb-1.5 text-slate-900"
                errorClassName="text-xs"
              />
              <div>
                <label className="block font-semibold mb-1.5 text-slate-900">
                  Referral Code{" "}
                  <span className="font-normal text-slate-500 text-xs">
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value);
                    setReferralCheck({ status: "idle" });
                  }}
                  onBlur={async (e) => {
                    if (!e.target.value.trim()) {
                      setReferralCheck({ status: "idle" });
                      return;
                    }
                    setReferralCheck({ status: "checking" });
                    setReferralCheck(await checkReferralCode(e.target.value));
                  }}
                  placeholder="e.g. from your hospital/clinic"
                  className="w-full p-3 rounded-xl border border-slate-300"
                />
                {referralCheck.status === "checking" && (
                  <p className="text-slate-400 text-xs mt-1">Checking code...</p>
                )}
                {referralCheck.status === "valid" && (
                  <p className="text-teal-700 font-semibold text-xs mt-1">
                    <i className="fa-solid fa-circle-check mr-1"></i>
                    Valid — referred by {referralCheck.hospitalName ?? "your partner hospital"}
                  </p>
                )}
                {referralCheck.status === "invalid" && (
                  <p className="text-red-600 font-semibold text-xs mt-1">
                    <i className="fa-solid fa-circle-exclamation mr-1"></i>
                    Code not recognized — double-check it or leave blank
                  </p>
                )}
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
              What would you like help with?
            </label>
            {categoriesLoaded && categories.length === 0 ? (
              <p className="text-xs text-red-600">
                No condition categories are available right now — please
                contact us directly to book.
              </p>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 bg-white"
              >
                <option value="" disabled>
                  — Select what you need help with —
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {formatInr(c.price_paise)} / {c.duration_minutes} min
                  </option>
                ))}
              </select>
            )}
          </div>

          {previousTherapists.length > 0 && (
            <div>
              <label className="block font-semibold mb-1.5 text-slate-900">
                Continue with the same therapist?{" "}
                <span className="font-normal text-slate-500 text-xs">
                  (optional)
                </span>
              </label>
              <select
                value={preferredTherapistId}
                onChange={(e) => setPreferredTherapistId(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 bg-white"
              >
                <option value="">No preference — any available specialist</option>
                {previousTherapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                We&apos;ll try to book you with them, subject to availability
                for your requested time.
              </p>
            </div>
          )}

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
              <span className="font-bold text-slate-900">
                {selectedCategory?.title}
              </span>
            </div>
            <div className="flex justify-between text-xs pt-3 border-t border-teal-100">
              <span className="text-slate-500">Session Fee</span>
              <span className="font-bold text-slate-900">
                {selectedCategory ? `${formatInr(selectedCategory.price_paise)} INR` : "—"}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            <i className="fa-solid fa-lock text-teal-600 mr-1"></i>
            Secure payment via Razorpay. Your slot is held once payment is
            confirmed.
          </p>
          <p className="text-xs text-slate-500">
            <i className="fa-solid fa-circle-info text-teal-600 mr-1"></i>
            Free cancellation up to {CANCELLATION_FULL_REFUND_HOURS} hours before
            your slot. Cancelling within {CANCELLATION_FULL_REFUND_HOURS} hours
            of the slot isn&apos;t eligible for a refund.
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
                ? `Pay ${selectedCategory ? formatInr(selectedCategory.price_paise) : ""} Now`
                : "Request Booking"}
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
