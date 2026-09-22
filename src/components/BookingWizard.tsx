"use client";

import { useEffect, useId, useState } from "react";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROGRAMME_NEEDS_RECOMMENDATION } from "@/lib/consultationFirst";
import { payForAppointment } from "@/lib/razorpay";
import PromoCodeField from "@/components/booking/PromoCodeField";
import { checkReferralCode, type ReferralCodeCheck } from "@/lib/checkReferralCode";
import { BASE_DURATION_MINUTES, CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import PhoneNumberField from "@/components/PhoneNumberField";
import WrongAccountForBooking, {
  type NonPatientRole,
} from "@/components/booking/WrongAccountForBooking";
import ConfirmPasswordField from "@/components/auth/ConfirmPasswordField";
import BookingStepOne from "@/components/booking/BookingStepOne";
import {
  BOOKING_LEAD_TIME_HOURS,
  BOOKING_LEAD_TIME_MS,
  bookableHoursForDate,
  earliestBookableDateKey,
} from "@/lib/bookingSlots";
import { debugNow } from "@/lib/debugNow";

type Category = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes: number;
};

// After this many failed/dismissed payment attempts on the same booking,
// offer an escape hatch -- the unpaid appointment isn't lost, it just sits
// as a normal pending booking the patient can retry later via the same
// Pay Now button their dashboard already shows for any unpaid session.
const MAX_ATTEMPTS_BEFORE_ESCAPE = 3;

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

type CheckoutQuoteResponse = {
  listPricePaise: number;
  discountPaise: number;
  payablePaise: number;
  travelFeePaise: number;
  totalPaise: number;
  discountLabel: string | null;
  /** What happens when the patient confirms. Named for the decision rather
   *  than the number, so this component never re-implements the gateway
   *  threshold -- and a named three-way rather than two booleans, which
   *  could contradict each other. */
  settlement: "gateway" | "free" | "pay_later";
  /** Whether paying now is possible at all. A different question: a patient
   *  on terms may still prefer to pay and not owe. */
  canPayNow: boolean;
};

export default function BookingWizard({
  initialCategories,
  bookingLanguages,
  promoCodesEnabled = false,
  cancellationRefundHours = CANCELLATION_FULL_REFUND_HOURS,
}: {
  initialCategories: Category[];
  // Admin-configured (Feature Control → Booking Languages), never a
  // hardcoded list here -- see lib/adminSettings.ts for the "English"
  // fallback that applies when admin hasn't configured any yet.
  bookingLanguages: string[];
  /** Whether the clinic is running any campaign at all. Off means the field
   *  is not on screen: a code box with nothing behind it teaches every
   *  patient that there is a discount they are missing. */
  promoCodesEnabled?: boolean;
  /** How long before the slot a cancellation still earns a full refund.
   *  An admin setting (Settings -> Booking Rules), and this screen used to
   *  print the constant instead -- so a clinic that changed the window had
   *  the old number quoted back at every patient on the one screen that
   *  reads as a promise. The constant is the default, never the answer. */
  cancellationRefundHours?: number;
}) {
  const refundWindowHours = cancellationRefundHours;
  const concernFieldId = useId();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [signedInRole, setSignedInRole] = useState<NonPatientRole | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  // The code the patient applied, if any. Held as a string and sent to
  // checkout as one -- the amount it is worth is never in this component.
  const [promoCode, setPromoCode] = useState<string | null>(null);
  // What the server says this booking costs, including every discount the
  // browser cannot see -- a first-session offer, an invite half. The button
  // reads from this rather than from the category price, because printing
  // one figure and opening Razorpay at another is the bug this replaced.
  const [quote, setQuote] = useState<CheckoutQuoteResponse | null>(null);
  // Which ending the confirmation screen describes. A booking settled later
  // is not a completed payment, and a screen that reads as one would be
  // telling somebody they did something they did not do.
  const [paidLater, setPaidLater] = useState(false);
  // What the pay-later confirmation actually wrote. Kept because this is the
  // one checkout ending in the app that never showed the patient a figure:
  // the session is booked, a discount may have come off, and the amount
  // frozen onto the row is the thing they will be asked for later. It comes
  // from the route's own response rather than from `quote`, which is a read
  // that could have moved between the tap and the write.
  const [owedLater, setOwedLater] = useState<{
    amountDuePaise: number;
    discountPaise: number;
    discountLabel: string | null;
  } | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Lazy initializer, not a bare Date.now() in the render body -- same
  // one-time-"now" pattern already used elsewhere in this codebase (see
  // ProfileSessionList) for grey-out logic that only needs to be roughly
  // fresh, not tick-perfect. Reads the QA debug tool's simulated clock
  // (Feature 44) when set, real time otherwise.
  const [nowMs] = useState(() => debugNow());

  // Step 1's automatic preselection. Computed in lazy initializers rather
  // than an effect, which is safe *specifically* because Step 1's markup
  // never appears in the server HTML: the `checkingAuth` branch below
  // renders "Loading..." on both server and first client render, so
  // hydration compares two identical trees and these clock-derived values
  // only reach the DOM afterwards, from the client's own clock. That
  // matters more than usual here -- /book is ISR-cached (revalidate = 300),
  // so a server-rendered date could be up to five minutes stale and would
  // mismatch on hydration if it were ever emitted.
  const [timezone, setTimezone] = useState("");
  const [bookDate, setBookDate] = useState(() => earliestBookableDateKey(nowMs) ?? "");
  const [bookHour, setBookHour] = useState<number | "">(
    () => bookableHoursForDate(earliestBookableDateKey(nowMs) ?? "", nowMs)[0] ?? ""
  );
  const [language, setLanguage] = useState(() => bookingLanguages[0] ?? "");

  // Tracks which of the three are still our automatic pick. Each flips
  // false the moment the patient chooses for themselves, so the "we picked
  // this for you" animation plays once and never re-fires on their input.
  const [autoPicked, setAutoPicked] = useState({ date: true, hour: true, language: true });

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
  const [categories] = useState<Category[]>(initialCategories);
  // Only preselect when the patient arrived via a specific "Book X" link
  // from the Conditions page -- that's a deliberate choice. Never default
  // to the first category in the list just because one exists; since each
  // one can carry a different price now, silently picking one for the
  // patient risks booking (and charging) them for a concern they never
  // actually chose.
  const [categoryId, setCategoryId] = useState(
    () => initialCategories.find((c) => c.id === searchParams.get("category"))?.id ?? ""
  );
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [previousTherapists, setPreviousTherapists] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [preferredTherapistId, setPreferredTherapistId] = useState("");

  // ?therapist= carries a specialist across from their profile on /team, so
  // "Book with Dr. X" books with Dr. X rather than dropping the visitor into
  // a generic wizard that has forgotten who they were reading about. It is a
  // *request*, not an assignment: it lands in preferred_therapist_id, which
  // preselects that therapist in the admin's assign form and marks them
  // "(requested)" -- the admin still decides, because only they can see
  // whether that therapist is actually free for the chosen slot.
  //
  // Resolved client-side against public_therapist_profiles, on the same
  // query-param-is-client-only basis as ?category= and ?package= above: the
  // page is ISR-cached, so nothing therapist-specific can be resolved
  // server-side. That view already hides suspended, unapproved and
  // team-hidden therapists, so a stale or hand-typed link simply resolves to
  // nothing and the booking carries on with no request attached.
  const therapistIdParam = searchParams.get("therapist");
  const [requestedTherapist, setRequestedTherapist] = useState<{
    id: string;
    full_name: string | null;
    credentials: string | null;
  } | null>(null);

  // /book sells one session. It used to sell multi-session programmes too,
  // via ?package=<id>, which meant the amount of treatment someone bought
  // was decided by a price list before any clinician had seen them.
  //
  // The parameter is still read, and still recognised, because links to it
  // outlive the feature -- an old email, a bookmark, a printed card. A
  // wizard that silently ignored it would quietly sell a single session to
  // someone who came here to buy six, which is a worse outcome than saying
  // what changed.
  const packageIdParam = searchParams.get("package");

  const supabase = createClient();
  const selectedCategory = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    // Reads the browser's detected timezone, which is only known once
    // mounted on the client - there's no way to get this during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (data.user) {
          setIsLoggedIn(true);
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email, role")
            .eq("id", data.user.id)
            .single();
          if (profile) {
            setFullName(profile.full_name);
            setEmail(profile.email);
            // A session belongs to exactly one role (profiles.id is the auth
            // user's id and role is a single column), so a therapist,
            // hospital or admin signed in here cannot also be the patient
            // this booking is for. Recorded so the wizard can say so rather
            // than book them as their own patient -- see the gate below.
            if (profile.role && profile.role !== "patient") {
              setSignedInRole(profile.role as NonPatientRole);
            }
          }
          // Best-effort "book with the same therapist again" - a fresh
          // account or a fetch failure just means the option doesn't show.
          fetch("/api/patient/previous-therapists")
            .then((res) => (res.ok ? res.json() : { therapists: [] }))
            .then((data) => setPreviousTherapists(data.therapists ?? []))
            .catch(() => {});
        }
      })
      .catch(() => {
        // Not logged in / session check failed - proceed as a guest booking.
      })
      .finally(() => setCheckingAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!therapistIdParam) return;
    let cancelled = false;
    supabase
      .from("public_therapist_profiles")
      .select("id, full_name, credentials")
      .eq("id", therapistIdParam)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setRequestedTherapist(data);
        setPreferredTherapistId(data.id);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapistIdParam]);

  function handleDateChange(nextDate: string) {
    setBookDate(nextDate);
    setError(null);
    // The previously-picked hour may not clear the lead time on the new
    // date, so re-preselect that day's earliest eligible slot instead of
    // carrying a now-invalid one forward. (The old date input cleared the
    // hour outright; preselecting keeps Step 1 complete after every change,
    // which is the point of the rework.)
    setBookHour(bookableHoursForDate(nextDate, nowMs)[0] ?? "");
    setAutoPicked((prev) => ({ ...prev, date: false, hour: true }));
  }

  function handleHourChange(nextHour: number) {
    setBookHour(nextHour);
    setError(null);
    setAutoPicked((prev) => ({ ...prev, hour: false }));
  }

  function handleLanguageChange(nextLanguage: string) {
    setLanguage(nextLanguage);
    setError(null);
    setAutoPicked((prev) => ({ ...prev, language: false }));
  }

  function goToStep2() {
    setError(null);
    if (!bookDate || bookHour === "") {
      setError("Please select a preferred date and time.");
      return;
    }
    // Unchanged rule, now sourced from the same constant the picker filters
    // on, so the calendar can't offer a slot this check would reject.
    if (new Date(slotDateTime).getTime() < nowMs + BOOKING_LEAD_TIME_MS) {
      setError(`Please choose a time at least ${BOOKING_LEAD_TIME_HOURS} hours from now.`);
      return;
    }
    if (!language) {
      setError("Please select a preferred language.");
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
    // The figures on the payment screen come from the server, not from the
    // category price this component happens to hold -- see refreshQuote.
    void refreshQuote(appointmentId, promoCode);
  }

  /**
   * Create the booking, then do whatever the re-quote says it needs.
   *
   * `intent` exists for one case: a patient on terms who would rather pay
   * and not owe. Paying now is never taken away from them -- but on the
   * first pass through this screen there is no appointment yet, so the
   * secondary link cannot simply call `startPayment`. It comes through here
   * instead and says, once the booking exists, to take the gateway rather
   * than the terms. `free` still wins over both: a discount that reached
   * zero leaves nothing for a gateway to charge, and Razorpay refuses an
   * order of nothing.
   */
  async function handleSubmit(intent: "default" | "pay_now" = "default") {
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
      // A signup with no session means the Supabase project has email
      // confirmation on, which this app does not use -- booking is gated by
      // payment and the admin's approval, never by an inbox round trip. It
      // is a misconfiguration rather than a step, so it reads as a failure
      // here instead of sending the patient away mid-booking.
      if (!data.session || !data.user) {
        setLoading(false);
        console.error(
          "Booking signup returned no session -- turn OFF Confirm email in Supabase Auth settings."
        );
        setError(
          "Your account was created but we couldn't sign you in to finish this booking. Please sign in and try again."
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

    // Deliberately a server route rather than the direct insert this used
    // to be. That insert was validated only by the appointments_insert_own
    // RLS policy, so a live database whose copy of that policy was even one
    // schema.sql change behind failed the booking outright -- and what the
    // patient saw, at the last step of checkout, was the raw Postgres text
    // "new row violates row-level security policy for table appointments".
    // The route re-derives concern, duration, lead time and the therapist
    // preference server-side (see its own header comment); the browser no
    // longer writes to appointments at all.
    let newAppointmentId: string;
    try {
      const res = await fetch("/api/appointments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categoryId || null,
          slotTime: new Date(slotDateTime).toISOString(),
          timezone,
          notes,
          preferredTherapistId: preferredTherapistId || null,
          preferredLanguage: language || null,
        }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result?.appointmentId) {
        setLoading(false);
        setError(result?.error ?? "Could not save your booking. Please try again.");
        return;
      }
      newAppointmentId = result.appointmentId as string;
    } catch {
      setLoading(false);
      setError("Could not reach the server. Please check your connection and try again.");
      return;
    }

    setAppointmentId(newAppointmentId);

    // Re-quoted against the real account and the real booking before
    // anything is charged. The quote on screen a moment ago may have been
    // the anonymous one -- a self-signup patient reads a price before their
    // account exists, so that quote answers for "a new patient" and knows
    // nothing of a goodwill adjustment or an invite half. This one knows
    // both, and create-order resolves it all again under a row lock anyway.
    const identified = await refreshQuote(newAppointmentId, promoCode);
    if (identified?.settlement === "free") {
      await confirmFree(newAppointmentId);
      return;
    }
    if (identified?.settlement === "pay_later" && intent !== "pay_now") {
      await confirmPayLater(newAppointmentId);
      return;
    }
    await startPayment(newAppointmentId);
  }

  /**
   * What a booking the discounts took to nothing does instead of paying.
   *
   * The server re-resolves the price and every discount under the same row
   * lock the order route uses and refuses if anything is still owed -- so
   * this is a request to confirm, never a claim that it is free.
   */
  async function confirmFree(id: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/appointments/confirm-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: id, promoCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        setError(data.error ?? "Could not confirm your booking. Please try again.");
        setFailedAttempts((n) => n + 1);
        // The price moved between the quote and this tap -- a cap filled, a
        // code was paused. Re-quote so the screen stops saying "free".
        await refreshQuote(id, promoCode);
        return;
      }
      setLoading(false);
      setDone(true);
    } catch {
      setLoading(false);
      setError("Could not reach the server. Please check your connection and try again.");
      setFailedAttempts((n) => n + 1);
    }
  }

  /**
   * What a trusted patient does instead of paying.
   *
   * The same shape as confirmFree above, and for the same reason: the server
   * re-derives whether this patient may settle afterwards, re-resolves the
   * price, and freezes it -- so this is a request to confirm, never a claim
   * to be allowed. The browser sends an appointment id and nothing about
   * terms.
   */
  async function confirmPayLater(id: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/appointments/confirm-pay-later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: id, promoCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        setError(data.error ?? "Could not confirm your booking. Please try again.");
        setFailedAttempts((n) => n + 1);
        // The answer moved between the quote and this tap -- terms stopped,
        // a code was paused. Re-quote so the screen stops offering it.
        await refreshQuote(id, promoCode);
        return;
      }
      setLoading(false);
      setPaidLater(true);
      // The figure the route wrote, never a re-read of it -- and never the
      // quote's, which is what this screen used to show nothing of at all.
      if (typeof data.amountDuePaise === "number") {
        setOwedLater({
          amountDuePaise: data.amountDuePaise,
          discountPaise: typeof data.discountPaise === "number" ? data.discountPaise : 0,
          discountLabel: quote?.discountLabel ?? null,
        });
      }
      setDone(true);
    } catch {
      setLoading(false);
      setError("Could not reach the server. Please check your connection and try again.");
      setFailedAttempts((n) => n + 1);
    }
  }

  /** The one place the payment screen's figures come from. Returns what it
   *  fetched as well as storing it, because the moment after signup needs
   *  the answer before a re-render can deliver it. */
  async function refreshQuote(
    id: string | null,
    code: string | null
  ): Promise<CheckoutQuoteResponse | null> {
    if (!categoryId && !id) return null;
    setQuoting(true);
    try {
      const res = await fetch("/api/appointments/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(id ? { appointmentId: id } : { categoryId }),
          promoCode: code,
        }),
      });
      const data = await res.json().catch(() => null);
      // A failed quote leaves the previous figures alone rather than
      // blanking the screen: the order route re-resolves and refuses
      // anything it cannot honour, so a stale quote can only ever be
      // corrected, never charged.
      if (res.ok && data) {
        setQuote(data as CheckoutQuoteResponse);
        return data as CheckoutQuoteResponse;
      }
      return null;
    } catch {
      // Same reasoning.
      return null;
    } finally {
      setQuoting(false);
    }
  }

  async function startPayment(id: string) {
    setError(null);
    setLoading(true);
    await payForAppointment({
      appointmentId: id,
      promoCode,
      onFree: () => {
        void confirmFree(id);
      },
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
        setFailedAttempts((n) => n + 1);
      },
      onDismiss: () => {
        setLoading(false);
        setError("Payment was not completed. You can try again below.");
        setFailedAttempts((n) => n + 1);
      },
    });
  }

  const header = (
    <div className="bg-slate-900 text-white p-6">
      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
        {done ? "Booking" : `Step ${step} of 3`}
      </span>
      <h1 className="text-xl font-bold">Book Virtual Physical Therapy Session</h1>
      <p className="text-xs text-slate-300 mt-1">
        {selectedCategory
          ? `${formatInr(selectedCategory.price_paise)} INR • ${
              selectedCategory.duration_minutes
            }-Min HD Video Call & Custom Rehab Plan`
          : "HD Video Call & Custom Rehab Plan - pricing shown once you pick a concern"}
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

  // Checked before every other branch: a therapist/hospital/admin session
  // booking here would write an appointment whose patient is them, which
  // none of their dashboards can show them (each filters by its own role's
  // column, and /patient/dashboard bounces a non-patient to /get-started).
  // They would pay for a session they could never find again.
  if (signedInRole) {
    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
        {header}
        <WrongAccountForBooking role={signedInRole} name={fullName} email={email} />
      </div>
    );
  }

  // A link to the old programme checkout, which no longer exists.
  //
  // Ordered after the wrong-account branch on purpose: a therapist who
  // followed this link needs to be told they cannot book on their own
  // account at all, which is true of every link they might follow, before
  // being told about a product change that does not apply to them.
  //
  // Answered rather than ignored: the wizard behind this would sell one
  // session to somebody who followed a link expecting to buy six, and
  // taking a different amount of money than a person came for is the one
  // outcome a removed checkout must not produce.
  if (packageIdParam) {
    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
        {header}
        <div className="p-8 text-center">
          <i className="fa-solid fa-user-doctor text-teal-600 text-4xl mb-4"></i>
          <h2 className="text-xl font-bold text-slate-900">
            Programmes come from your therapist now
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {PROGRAMME_NEEDS_RECOMMENDATION}
          </p>
          <Link
            href="/book"
            className="mt-6 inline-block rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
          >
            Book a first session
          </Link>
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
          {/* A session to be settled afterwards is not a completed payment,
              and a screen reading "Payment Confirmed" would be telling
              somebody they did something they did not do. It says what is
              true -- booked, nothing taken -- and when the money appears,
              which is after the session rather than now. */}
          <h2 className="text-xl font-bold text-slate-900">
            {paidLater ? "Booking Confirmed" : "Payment Confirmed"}
          </h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {paidLater ? (
              <>
                Your session is booked and there&apos;s nothing to pay now. It&apos;s added to
                what you owe once the session has happened, and you can settle whenever suits
                you. We&apos;ll confirm your exact slot and send the video call link by email
                or WhatsApp shortly.
              </>
            ) : (
              <>
                Your session is booked and paid. We&apos;ll confirm your exact slot and send
                the video call link by email or WhatsApp shortly.
              </>
            )}
          </p>

          {/* The price was frozen at this moment and any discount was
              applied at it, so this is the one place either can be queried.
              Left unsaid, a patient met the figure for the first time on a
              screen asking them to settle it. */}
          {paidLater && owedLater && (
            <div className="mt-5 mx-auto max-w-xs rounded-2xl bg-teal-50 border border-teal-100 p-4 text-left">
              <p className="text-xs text-slate-600">After your session you&apos;ll owe</p>
              <p className="text-2xl font-bold text-teal-800 mt-0.5">
                {formatInr(owedLater.amountDuePaise)}
              </p>
              {owedLater.discountPaise > 0 && (
                <p className="text-[11px] text-teal-700 mt-1">
                  {owedLater.discountLabel ?? "Discount"} - this price is held for this
                  session whatever changes later.
                </p>
              )}
              <p className="text-[11px] text-slate-500 mt-2">
                Nothing is owed until the session has happened. You can see it on your
                dashboard afterwards.
              </p>
            </div>
          )}
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
      {/* p-5 on phones rather than a flat p-8: Step 1's calendar is a
          7-column grid whose cells are squeezed directly by this padding.
          Restores p-8 from sm: up, where there's room to spare. */}
      <div className="p-5 sm:p-8 space-y-5 text-sm">
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {step === 1 && (
        <BookingStepOne
          timezone={timezone}
          nowMs={nowMs}
          dateKey={bookDate}
          onDateChange={handleDateChange}
          hour={bookHour}
          onHourChange={handleHourChange}
          language={language}
          onLanguageChange={handleLanguageChange}
          languages={bookingLanguages}
          autoPicked={autoPicked}
          onContinue={goToStep2}
        />
      )}

      {step === 2 && (
        <>
          {isLoggedIn ? (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-xs text-teal-800">
              Booking as <strong>{fullName}</strong> ({email})
            </div>
          ) : (
            <>
              <label className="block">
                <span className="block font-semibold mb-1.5 text-slate-900">
                  Full Name
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full p-3 rounded-xl border border-slate-300"
                />
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block font-semibold mb-1.5 text-slate-900">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full p-3 rounded-xl border border-slate-300"
                  />
                </label>
                <label className="block">
                  <span className="block font-semibold mb-1.5 text-slate-900">
                    Create Password{" "}
                    <span className="font-normal text-slate-500 text-xs">
                      (for portal access)
                    </span>
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    className="w-full p-3 rounded-xl border border-slate-300"
                  />
                </label>
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
              <label className="block">
                <span className="block font-semibold mb-1.5 text-slate-900">
                  Referral Code{" "}
                  <span className="font-normal text-slate-500 text-xs">
                    (optional)
                  </span>
                </span>
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
                  <p className="text-slate-500 text-xs mt-1">Checking code...</p>
                )}
                {referralCheck.status === "valid" && (
                  <p className="text-teal-700 font-semibold text-xs mt-1">
                    <i className="fa-solid fa-circle-check mr-1"></i>
                    Valid - referred by {referralCheck.hospitalName ?? "your partner hospital"}
                  </p>
                )}
                {referralCheck.status === "invalid" && (
                  <p className="text-red-600 font-semibold text-xs mt-1">
                    <i className="fa-solid fa-circle-exclamation mr-1"></i>
                    Code not recognized - double-check it or leave blank
                  </p>
                )}
              </label>
              <p className="text-[11px] text-slate-500">
                Already have an account?{" "}
                <Link href="/patient/login" className="text-teal-700 font-semibold">
                  Sign in first
                </Link>{" "}
                so this booking links to it.
              </p>
            </>
          )}

          <div>
            {/* Associated with `htmlFor`, not by sitting above the control:
                a label that is merely adjacent is announced to nobody, and
                this is the field the whole booking hangs on. */}
            <label htmlFor={concernFieldId} className="block font-semibold mb-1.5 text-slate-900">
              What would you like help with?
            </label>
            {categories.length === 0 ? (
              <p className="text-xs text-red-600">
                No condition categories are available right now - please
                contact us directly to book.
              </p>
            ) : (
              <select
                id={concernFieldId}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 bg-white"
              >
                <option value="" disabled>
                  - Select what you need help with -
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} - {formatInr(c.price_paise)} / {c.duration_minutes} min
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* The request carried over from a specialist's profile. Stated as
              a request rather than a booked fact, because the admin assigns
              against real availability and can land on someone else -- a
              patient who was told "booked with Dr. X" and then met someone
              else would rightly feel misled. */}
          {requestedTherapist && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                  <i aria-hidden="true" className="fa-solid fa-user-doctor text-xs" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-teal-900">
                    Requested: {requestedTherapist.full_name}
                  </p>
                  {requestedTherapist.credentials && (
                    <p className="text-xs font-semibold text-teal-700">
                      {requestedTherapist.credentials}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] leading-relaxed text-teal-800">
                    We&apos;ll book you with them if they&apos;re free at your chosen time.
                    If not, another specialist takes the session and you&apos;ll see who
                    before it starts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRequestedTherapist(null);
                    setPreferredTherapistId("");
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-teal-700 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {!requestedTherapist && previousTherapists.length > 0 && (
            <label className="block">
              <span className="block font-semibold mb-1.5 text-slate-900">
                Continue with the same therapist?{" "}
                <span className="font-normal text-slate-500 text-xs">
                  (optional)
                </span>
              </span>
              <select
                value={preferredTherapistId}
                onChange={(e) => setPreferredTherapistId(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 bg-white"
              >
                <option value="">No preference - any available specialist</option>
                {previousTherapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                We&apos;ll try to book you with them, subject to availability
                for your requested time.
              </p>
            </label>
          )}

          <label className="block">
            <span className="block font-semibold mb-1.5 text-slate-900">
              Anything else we should know?{" "}
              <span className="font-normal text-slate-500 text-xs">
                (optional)
              </span>
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Briefly describe your pain, injury, or goals"
              className="w-full p-3 rounded-xl border border-slate-300"
            />
          </label>

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
              <span className="text-slate-500">
                Preferred Time
              </span>
              <span className="font-bold text-slate-900">
                {slotDateTime && formatClinicDateTime(slotDateTime)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Language</span>
              <span className="font-bold text-slate-900">{language || "-"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Concern</span>
              <span className="font-bold text-slate-900">{selectedCategory?.title}</span>
            </div>
            <div className="flex justify-between text-xs pt-3 border-t border-teal-100">
              <span className="text-slate-500">Session Fee</span>
              <span className={`font-bold text-slate-900 ${quote && quote.discountPaise > 0 ? "line-through opacity-60" : ""}`}>
                {quote
                  ? `${formatInr(quote.listPricePaise)} INR`
                  : selectedCategory
                    ? `${formatInr(selectedCategory.price_paise)} INR`
                    : "-"}
              </span>
            </div>
            {quote && quote.discountPaise > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-teal-700">{quote.discountLabel ?? "Discount"}</span>
                <span className="font-bold text-teal-700">
                  −{formatInr(quote.discountPaise)}
                </span>
              </div>
            )}
            {quote && quote.travelFeePaise > 0 && (
              <div className="flex justify-between text-xs">
                {/* Never discounted: a pass-through paid to the therapist in
                    full, so it is added after the discount and shown as its
                    own line rather than folded into a price. */}
                <span className="text-slate-500">Travel</span>
                <span className="font-bold text-slate-900">
                  {formatInr(quote.travelFeePaise)}
                </span>
              </div>
            )}
            {quote && (
              <div className="flex justify-between text-sm pt-3 border-t border-teal-100">
                <span className="font-semibold text-slate-700">Total</span>
                <span className="font-extrabold text-slate-900">
                  {quote.settlement === "free" ? "Free" : `${formatInr(quote.totalPaise)} INR`}
                </span>
              </div>
            )}
          </div>
          {promoCodesEnabled && (
            <div className="pt-1">
              <PromoCodeField
                categoryId={selectedCategory?.id ?? null}
                appointmentId={appointmentId}
                onApplied={(code) => {
                  setPromoCode(code);
                  // Re-quoted rather than adjusted here: the code may not be
                  // the largest discount this patient qualifies for, and the
                  // total has to be the one the order route will resolve.
                  void refreshQuote(appointmentId, code);
                }}
              />
            </div>
          )}
          <p className="text-xs text-slate-500">
            <i className="fa-solid fa-lock text-teal-600 mr-1"></i>
            {quote?.settlement === "free"
              ? "Nothing to pay - your discount covers this session in full. Your slot is held once you confirm."
              : quote?.settlement === "pay_later"
                ? "Nothing to pay now. Your slot is held once you confirm, and this session is added to what you owe after it has happened."
                : "Secure payment via Razorpay. Your slot is held once payment is confirmed."}
          </p>
          {/* What cancelling costs, and it is a different sentence for a
              patient on terms -- they are paying nothing now, so a refund
              window is not a fact about their booking. Nothing is owed until
              a session has actually happened, so cancelling before it simply
              never creates the debt; telling them instead that they would
              "not be eligible for a refund" describes money they never paid.

              Built as one string rather than text around `{expr}` on its own
              line: JSX drops the newline and the indentation between an
              expression and the text after it, which is how this rendered as
              "within 24hours of the slot" on the one screen where a number
              and a unit have to read as a number and a unit. */}
          <p className="text-xs text-slate-500">
            <i className="fa-solid fa-circle-info text-teal-600 mr-1"></i>
            {quote?.settlement === "pay_later"
              ? `Cancel any time before your slot and you won't owe anything for it - a session is only added to what you owe once it has happened.`
              : `Free cancellation up to ${refundWindowHours} hours before your slot. Cancelling within ${refundWindowHours} hours of the slot isn't eligible for a refund.`}
          </p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => {
                // Going back to change details abandons the current unpaid
                // draft rather than silently retrying payment against the
                // old (possibly now-stale) booking -- it stays in the
                // patient's dashboard as a normal unpaid session either way,
                // same as if they'd just closed the tab here.
                setAppointmentId(null);
                setFailedAttempts(0);
                setError(null);
                setStep(2);
              }}
              disabled={loading}
              className="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3.5 rounded-xl transition disabled:opacity-60"
            >
              Back
            </button>
            <button
              onClick={
                appointmentId
                  ? quote?.settlement === "free"
                    ? () => confirmFree(appointmentId)
                    : quote?.settlement === "pay_later"
                      ? () => confirmPayLater(appointmentId)
                      : () => startPayment(appointmentId)
                  : // Wrapped rather than passed bare: `handleSubmit` takes an
                    // intent now, and React would hand it the click event.
                    () => handleSubmit()
              }
              // Disabled while a quote is in flight, so a tap can never act
              // on a figure that is about to change.
              disabled={loading || quoting}
              className="w-2/3 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition shadow-lg"
            >
              {loading
                ? "Please wait..."
                : quote?.settlement === "free"
                  ? "Confirm booking - free"
                  : quote?.settlement === "pay_later"
                    ? "Confirm booking - pay later"
                    : appointmentId
                      ? `Pay ${formatInr(quote?.totalPaise ?? selectedCategory?.price_paise ?? 0)} Now`
                      : "Request Booking"}
            </button>
          </div>
          {/* Paying now is never taken away from somebody who may settle
              later. Switching this arrangement on for a patient must not
              remove a choice they had -- some will simply rather pay and not
              owe, and it produces an ordinary prepaid session that touches
              none of this. Secondary weight, because settling later is why
              they were given terms.

              Deliberately NOT gated on `appointmentId`. It was, and that is
              the whole rule failing in practice: the appointment is created
              by the tap, so on the first pass through this screen there is
              never an id and the link never rendered at all. A patient on
              terms saw one button and no choice -- exactly what this is
              here to prevent -- and it only appeared after a *failed*
              payment had left an id behind. */}
          {quote?.settlement === "pay_later" && quote.canPayNow && (
            <button
              onClick={() =>
                appointmentId ? startPayment(appointmentId) : handleSubmit("pay_now")
              }
              disabled={loading || quoting}
              className="w-full text-center text-xs font-semibold text-teal-700 underline underline-offset-2 disabled:opacity-60"
            >
              Or pay {formatInr(quote.totalPaise)} now instead
            </button>
          )}
          {/* One failure is enough to want reassurance. A patient whose card
              was declined has no way of knowing their booking survived, and
              the most likely next action is to close the tab -- so the fact
              that nothing was lost is said immediately, and the escape
              hatch to the dashboard still waits until retrying here has
              plainly stopped working. */}
          {appointmentId &&
            failedAttempts > 0 &&
            failedAttempts < MAX_ATTEMPTS_BEFORE_ESCAPE && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-600">
                Nothing was lost - your booking is saved and still held as unpaid. You can try
                again above, or pay later from your dashboard.
              </p>
            )}
          {appointmentId && failedAttempts >= MAX_ATTEMPTS_BEFORE_ESCAPE && (
            <div className="text-xs text-center bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 space-y-2">
              <p>
                Having trouble paying? Your booking is saved as pending - you
                can come back and pay any time from your dashboard.
              </p>
              <Link
                href="/patient/dashboard"
                className="inline-block font-bold text-teal-700 hover:underline"
              >
                Go to Dashboard →
              </Link>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
