"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { preloadRazorpayScript } from "@/lib/razorpay";
import { revealField } from "@/lib/revealField";
import { startCheckoutTimer, type CheckoutTimer } from "@/lib/checkoutTiming";
import CheckoutProgress, { type CheckoutProgressStage } from "@/components/booking/CheckoutProgress";
import {
  publishBookingPaymentTrouble,
} from "@/lib/bookingPaymentTrouble";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { escapeOffered, type PaymentTryAnswer, type PaymentTryOutcome } from "@/lib/paymentTries";
import {
  isDirectlyPurchasable,
  PROGRAMME_NEEDS_RECOMMENDATION,
} from "@/lib/consultationFirst";
import BookingCalendar from "@/components/booking/BookingCalendar";
import SelectableChipGroup, { type ChipOption } from "@/components/booking/SelectableChipGroup";
import AddressForm from "@/components/booking/AddressForm";
import PhoneNumberField from "@/components/PhoneNumberField";
import WrongAccountForBooking, {
  type NonPatientRole,
} from "@/components/booking/WrongAccountForBooking";
import {
  bookableHoursForDate,
  earliestBookableDateKey,
  formatDateKeyLong,
  leadTimeMsFromHours,
} from "@/lib/bookingSlots";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatHourLabel } from "@/lib/therapistAvailability";
import { debugNow } from "@/lib/debugNow";
import { isValidPincodeShape, normalizePincode } from "@/lib/homeVisitAreas";
import { computeHomeVisitTotal } from "@/lib/homeVisitPricing";
import {
  payForHomeVisit,
  type HomeVisitAddressForm,
  type HomeVisitPaymentResult,
} from "@/lib/homeVisitPayment";
import { checkReferralCode, type ReferralCodeCheck } from "@/lib/checkReferralCode";
import { rateLimitNotice } from "@/lib/rateLimit";
import ServicePicker from "@/components/booking/ServicePicker";
import ChosenServiceSummary from "@/components/booking/ChosenServiceSummary";
import { homeVisitServiceOption } from "@/lib/serviceOptions";
import { formatRupees } from "@/lib/formatMoney";

// The six fields this wizard has always read, plus what the service picker
// shows. The optional ones are optional for two different reasons: the focal
// pair is migration-dependent and read in its own query, and the rest are
// nullable columns an admin may simply not have filled in.
export type WizardPackage = {
  id: string;
  title: string;
  visit_count: number;
  price_paise: number;
  visit_duration_minutes: number;
  travel_fee_included: boolean;
  subtitle?: string | null;
  description?: string | null;
  terms?: string | null;
  badge_label?: string | null;
  highlight?: boolean | null;
  benefits?: unknown;
  compare_at_paise?: number | null;
  validity_days?: number | null;
  therapist_locked?: boolean | null;
  image_url?: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
};

type AreaCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "serviceable"; city: string; areaName: string | null; travelFeePaise: number }
  | { state: "unserviceable" }
  | { state: "error"; message: string };

function inputCls() {
  return "w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
}

export default function HomeVisitBookingWizard({
  packages,
  leadTimeHours,
  cashEnabled = false,
  paymentTriesBeforeAccess = DEFAULT_ADMIN_SETTINGS.paymentTriesBeforeAccess,
}: {
  packages: WizardPackage[];
  leadTimeHours: number;
  // site_settings.home_visit_cash_enabled. When false, the wizard never
  // offers "pay at the door" and behaves exactly as it did before this
  // option existed.
  cashEnabled?: boolean;
  /** Unsuccessful payment tries before a new patient's locked account opens
   *  (`site_settings.payment_tries_before_access`, see paymentTries.ts). */
  paymentTriesBeforeAccess?: number;
}) {
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Read once at mount rather than on every render -- a Date.now() in the
  // render body is an impure call. Same lazy-initializer pattern as
  // BookingWizard.
  const [nowMs] = useState(() => debugNow());
  const leadTimeMs = leadTimeMsFromHours(leadTimeHours);

  const [step, setStep] = useState(1);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [signedInRole, setSignedInRole] = useState<NonPatientRole | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  // The Pay tap's progress overlay and its tap-to-sheet timing (see
  // checkoutTiming). Drawn only while `loading`.
  const [payStage, setPayStage] = useState<CheckoutProgressStage | null>(null);
  const [payIncludesAccount, setPayIncludesAccount] = useState(false);
  const timerRef = useRef<CheckoutTimer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [paymentResult, setPaymentResult] = useState<HomeVisitPaymentResult | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  // Same lock as the online wizard: a new patient's dashboard opens on a
  // payment, or once their tries run out (/api/patient/payment-try).
  const [accountUnlocked, setAccountUnlocked] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const escapeOpen = escapeOffered({
    unlocked: accountUnlocked,
    justUnlocked,
    failuresThisVisit: failedAttempts,
    limit: paymentTriesBeforeAccess,
  });

  // Step 1 -- serviceability, then the address.
  const [pincode, setPincode] = useState("");
  const [areaCheck, setAreaCheck] = useState<AreaCheck>({ state: "idle" });
  const [address, setAddress] = useState<HomeVisitAddressForm>({ line1: "", pincode: "" });
  const [waitlistPhone, setWaitlistPhone] = useState("");
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  // Step 2 -- when.
  const [timezone, setTimezone] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookHour, setBookHour] = useState<number | "">("");
  const [autoPicked, setAutoPicked] = useState({ date: true, hour: true });

  // What can actually be bought here: a single visit, which is the
  // home-visit consultation. A course of visits is a therapist's
  // recommendation after they have seen someone, so it is never on this
  // list -- see src/lib/consultationFirst.ts, and both home-visit purchase
  // routes, which refuse one regardless of what the browser sends.
  const sellablePackages = useMemo(
    () => packages.filter((p) => isDirectlyPurchasable(p.visit_count)),
    [packages]
  );

  // A link to a programme that is no longer sold this way. Answered rather
  // than quietly swapped for a different package: charging someone for one
  // visit when they followed a link expecting six is the failure a removed
  // checkout must not produce.
  const requestedPackageId = searchParams.get("package");
  const requestedIsProgramme =
    !!requestedPackageId &&
    packages.some(
      (p) => p.id === requestedPackageId && !isDirectlyPurchasable(p.visit_count)
    );

  // Step 3 -- who.
  const [packageId, setPackageId] = useState(
    () =>
      (requestedPackageId && !requestedIsProgramme ? requestedPackageId : null) ??
      sellablePackages[0]?.id ??
      ""
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralCheck, setReferralCheck] = useState<ReferralCodeCheck>({ status: "idle" });
  const [concern, setConcern] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  // Step 4 -- how to pay. Defaults to prepaid regardless of cashEnabled: a
  // prepaid visit needs no admin approval before it is confirmed (see
  // bookHomeVisitSession's isPrepaid branch), so it's the faster path for
  // anyone indifferent between the two.
  const [paymentMode, setPaymentMode] = useState<"prepaid" | "cash">("prepaid");

  const selectedPackage =
    sellablePackages.find((p) => p.id === packageId) ?? sellablePackages[0] ?? null;

  // Mapped once: these rows arrive as props and never change, and the
  // picker's dialog re-renders on every tap inside it.
  const serviceOptions = useMemo(
    () => sellablePackages.map((p) => homeVisitServiceOption(p)),
    [sellablePackages]
  );
  // The same row the picker is showing, so Step 3's statement of it cannot
  // describe the visit differently from the control that chose it.
  const selectedOption =
    serviceOptions.find((o) => o.id === selectedPackage?.id) ?? null;

  // The picker lives on Step 1, above the pincode, because the serviceable
  // answer below it has to say whether travel is charged on top -- and that
  // is `travel_fee_included` on whichever visit was chosen. Asking for the
  // pincode first and the package two steps later meant that sentence was
  // written before the thing it describes had been picked.
  const servicePicker = (
    <ServicePicker
      options={serviceOptions}
      value={selectedPackage?.id ?? ""}
      onChange={setPackageId}
      label="Your visit"
      browseHeading="Which visit do you need?"
      browseBlurb={(count) =>
        `${count} visit${count === 1 ? "" : "s"} available to book, with prices and what each covers.`
      }
      chooseLabel="Choose this visit"
      aboutTitle="About this visit"
      emptyMessage="No home visits are available to book right now - please contact us directly."
      singleOptionNote="This is the only visit on offer today, so it is already chosen for you."
    />
  );

  // Fetch checkout.js while the patient is still filling the form, so the Pay
  // tap is not the one that pays for the download.
  useEffect(() => {
    preloadRazorpayScript();
  }, []);

  // Tells the page-level exit link whether to show (see bookingPaymentTrouble).
  useEffect(() => {
    publishBookingPaymentTrouble({
      onPaymentStep: step === 4 && !done,
      escapeOpen,
      done,
    });
    return () => publishBookingPaymentTrouble({ onPaymentStep: false, escapeOpen: false });
  }, [step, done, escapeOpen]);

  useEffect(() => {
    // The browser's detected timezone is only knowable once mounted on the
    // client -- there is no way to read it during render, and this page is
    // ISR-cached, so a server-rendered value could be stale and mismatch on
    // hydration. Same deliberate exception BookingWizard makes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user) {
        setIsLoggedIn(true);
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, phone, role, approved")
          .eq("id", data.user.id)
          .single();
        if (!active) return;
        setAccountUnlocked(profile?.approved === true);
        setFullName(profile?.full_name ?? "");
        setEmail(profile?.email ?? data.user.email ?? "");
        setPhone(profile?.phone ?? "");
        // Same one-role-per-account reasoning as the online wizard's own
        // gate -- a home visit is delivered to a patient, so a therapist or
        // hospital session cannot be the one buying it.
        if (profile?.role && profile.role !== "patient") {
          setSignedInRole(profile.role as NonPatientRole);
        }
      }
      setCheckingAuth(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Slot preselection is deferred until the area check passes, rather than
  // done at mount: someone we can't reach never gets as far as picking a
  // time, and preselecting one for them would be answering a question they
  // haven't earned yet.
  function primeSlotDefaults() {
    if (bookDate) return;
    const earliest = earliestBookableDateKey(nowMs, leadTimeMs);
    if (!earliest) return;
    setBookDate(earliest);
    const hours = bookableHoursForDate(earliest, nowMs, leadTimeMs);
    setBookHour(hours[0] ?? "");
  }

  async function handleCheckArea() {
    const normalized = normalizePincode(pincode);
    if (!isValidPincodeShape(normalized)) {
      setAreaCheck({ state: "error", message: "Enter a valid 6-digit pincode." });
      return;
    }
    setAreaCheck({ state: "checking" });
    try {
      const res = await fetch(`/api/home-visit/check-area?pincode=${normalized}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAreaCheck({
          state: "error",
          // `rateLimitNotice` adds the concrete wait when there is one, and
          // returns the sentence untouched when there is not -- so an
          // ordinary failure reads exactly as it did.
          message: rateLimitNotice(
            data.error ?? "Could not check that pincode. Please try again.",
            data.retryAfterSeconds
          ),
        });
        return;
      }
      if (!data.serviceable) {
        setAreaCheck({ state: "unserviceable" });
        return;
      }
      setAreaCheck({
        state: "serviceable",
        city: data.area?.city ?? "",
        areaName: data.area?.areaName ?? null,
        travelFeePaise: data.travelFeePaise ?? 0,
      });
      setAddress((prev) => ({
        ...prev,
        pincode: normalized,
        city: prev.city || (data.area?.city ?? ""),
      }));
    } catch {
      setAreaCheck({
        state: "error",
        message: "Could not check that pincode. Please check your connection.",
      });
    }
  }

  async function handleJoinWaitlist() {
    setWaitlistError(null);
    const res = await fetch("/api/home-visit/join-waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: waitlistName || fullName || null,
        phone: waitlistPhone || phone,
        email: email || null,
        pincode: normalizePincode(pincode),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setWaitlistJoined(true);
    } else if (data.serviceable) {
      // The clinic started serving this pincode since it was checked. Not a
      // waitlist entry -- re-run the check so the wizard moves straight on
      // to booking.
      await handleCheckArea();
    } else {
      setWaitlistError(
        rateLimitNotice(
          data.error ?? "Could not save that. Please try again.",
          data.retryAfterSeconds
        )
      );
    }
  }

  const hourOptions: ChipOption[] = bookDate
    ? bookableHoursForDate(bookDate, nowMs, leadTimeMs).map((h) => ({
        value: String(h),
        label: formatHourLabel(h),
      }))
    : [];

  const slotDateTime =
    bookDate && bookHour !== ""
      ? `${bookDate}T${String(bookHour).padStart(2, "0")}:00`
      : "";

  const total = selectedPackage
    ? computeHomeVisitTotal({
        packagePricePaise: selectedPackage.price_paise,
        travelFeePaise:
          areaCheck.state === "serviceable" ? areaCheck.travelFeePaise : 0,
        travelIncluded: selectedPackage.travel_fee_included,
        visitCount: selectedPackage.visit_count,
      })
    : null;

  /** A failed rule, said once and shown where it is: the message, and the
   *  page taken to the field that needs attention. */
  function failField(message: string, fieldId: string) {
    setError(message);
    requestAnimationFrame(() => revealField(fieldId));
  }

  function goToStep2() {
    setError(null);
    if (!address.line1.trim()) {
      failField("Please enter your street address.", "hv-address");
      return;
    }
    primeSlotDefaults();
    setStep(2);
  }

  function goToStep3() {
    setError(null);
    if (!bookDate || bookHour === "") {
      failField("Please pick a date and time.", "hv-slot");
      return;
    }
    if (new Date(slotDateTime).getTime() < nowMs + leadTimeMs) {
      setError(`Please choose a slot at least ${leadTimeHours} hours from now.`);
      return;
    }
    setStep(3);
  }

  function goToStep4() {
    setError(null);
    if (!fullName.trim()) {
      failField("Please enter your full name.", "hv-fullname");
      return;
    }
    if (!email.trim()) {
      failField("Please enter your email address.", "hv-email");
      return;
    }
    if (!isLoggedIn) {
      if (password.length < 8) {
        failField("Please choose a password of at least 8 characters.", "hv-password");
        return;
      }
      if (password !== confirmPassword) {
        failField("Those passwords don't match.", "hv-confirm-password");
        return;
      }
    }
    if (!consent) {
      failField("Please confirm you're happy for a therapist to visit this address.", "hv-consent");
      return;
    }
    setStep(4);
  }

  async function handleSubmit() {
    if (!selectedPackage) return;
    setLoading(true);
    setError(null);
    // Timed and staged only on the gateway path: cash at the door opens no
    // sheet, so there is nothing to measure against and nothing to wait for.
    const viaGateway = paymentMode !== "cash";
    const needsAccount = !isLoggedIn;
    timerRef.current = viaGateway
      ? startCheckoutTimer({ flow: "home_visit", newAccount: needsAccount })
      : null;
    setPayIncludesAccount(needsAccount);
    setPayStage(viaGateway ? (needsAccount ? "account" : "opening") : null);
    try {
      await handleSubmitInner();
    } finally {
      // Anything that reached the sheet has already reported "opened".
      timerRef.current?.finish("error");
    }
  }

  /** One try that did not end in a payment -- see the online wizard's twin. */
  async function noteFailedTry(outcome: PaymentTryOutcome) {
    setFailedAttempts((n) => n + 1);
    try {
      const res = await fetch("/api/patient/payment-try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow: "home_visit", outcome }),
      });
      if (!res.ok) return;
      const answer = (await res.json()) as PaymentTryAnswer;
      if (answer.unlocked) setAccountUnlocked(true);
      if (answer.justUnlocked) setJustUnlocked(true);
    } catch {
      // The try still counts here; the next one reports.
    }
  }

  async function handleSubmitInner() {
    if (!selectedPackage) return;

    if (!isLoggedIn) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: "patient",
            full_name: fullName,
            phone,
            referral_code: referralCode.trim() || undefined,
            // Locked until it pays or runs out of tries; deleted if it does
            // neither (see purge_abandoned_booking_accounts).
            signup_source: "booking",
          },
        },
      });
      if (signUpError) {
        setLoading(false);
        setError(signUpError.message);
        return;
      }
      // No session means email confirmation is on for this project, which
      // this app does not use (see the online wizard's note) -- nothing can
      // be paid for, so fail here rather than at the payment step.
      if (!data.session || !data.user) {
        setLoading(false);
        console.error(
          "Home-visit signup returned no session -- turn OFF Confirm email in Supabase Auth settings."
        );
        setError(
          "Your account was created but we couldn't sign you in to finish this booking. Please sign in and try again."
        );
        return;
      }
    }

    if (paymentMode === "cash") {
      try {
        const res = await fetch("/api/home-visit/book-cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: selectedPackage.id,
            address: { ...address, pincode: normalizePincode(address.pincode) },
            slotDateTime,
            timezone,
            notes,
            concern: concern || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        if (!res.ok) {
          setError(data.error ?? "Could not book this visit. Please try again.");
          if (res.status >= 500) void noteFailedTry("server_error");
          return;
        }
        setPaymentResult({
          visitBooked: !!data.visitBooked,
          appointmentId: data.appointmentId,
          visitBookingError: data.visitBookingError,
          addressNotSaved: !!data.addressNotSaved,
        });
        setDone(true);
      } catch {
        setLoading(false);
        setError("Could not book this visit. Please check your connection and try again.");
        void noteFailedTry("server_error");
      }
      return;
    }

    if (!isLoggedIn) timerRef.current?.mark("signup");
    setPayStage("opening");
    await payForHomeVisit({
      onOpen: () => {
        timerRef.current?.mark("order");
        timerRef.current?.finish("opened");
        setPayStage("paying");
      },
      packageId: selectedPackage.id,
      address: { ...address, pincode: normalizePincode(address.pincode) },
      name: fullName,
      email,
      description: selectedPackage.title,
      slotDateTime,
      timezone,
      notes,
      concern: concern || undefined,
      onSuccess: (result) => {
        setLoading(false);
        setPaymentResult(result);
        setDone(true);
      },
      onError: (message) => {
        setLoading(false);
        setError(message);
        void noteFailedTry("failed");
      },
      onDismiss: () => {
        setLoading(false);
        setError("Payment was not completed. You can try again below.");
        void noteFailedTry("dismissed");
      },
    });
  }

  if (checkingAuth) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Loading...
      </div>
    );
  }

  if (signedInRole) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <WrongAccountForBooking role={signedInRole} name={fullName} email={email} />
      </div>
    );
  }

  if (requestedIsProgramme) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <i className="fa-solid fa-user-doctor mb-4 text-4xl text-teal-600"></i>
        <h2 className="text-xl font-bold text-slate-900">
          Courses of visits come from your therapist now
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {PROGRAMME_NEEDS_RECOMMENDATION}
        </p>
        <Link
          href="/book-home-visit"
          className="mt-6 inline-block rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
        >
          Book a first visit
        </Link>
      </div>
    );
  }

  if (sellablePackages.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-600">
          Home visit packages aren&apos;t available right now.
        </p>
        <Link href="/" className="mt-4 inline-block text-xs font-semibold text-teal-700 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <i className="fa-solid fa-circle-check text-4xl text-teal-600" />
        <h2 className="font-display mt-4 text-xl font-bold text-slate-900">
          {paymentResult?.visitBooked
            ? "Your home visit is requested"
            : paymentMode === "cash"
              ? "Your home visit is requested"
              : "Payment received"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {paymentResult?.visitBooked
            ? "We'll confirm your therapist and send a calendar invite with the address and time once everything's set."
            : paymentResult?.visitBookingError ??
              (paymentMode === "cash"
                ? "We've saved your request. Schedule your visit from your dashboard if it doesn't show up shortly."
                : "Your package is paid for. Schedule your visit from your dashboard.")}
        </p>
        {paymentResult?.addressNotSaved && (
          <p className="mt-3 text-xs text-slate-500">
            We couldn&apos;t add this address to your saved addresses. Your visit has it, so
            nothing is lost - you can save it from your profile any time.
          </p>
        )}
        <Link
          href="/patient/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700"
        >
          Go to my dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {loading && payStage && step === 4 && (
        <CheckoutProgress stage={payStage} includeAccount={payIncludesAccount} />
      )}
      <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Step {step} of 4
      </p>

      {step === 1 && (
        <div className="space-y-5">
          {servicePicker}

          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Where should we come?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              We&apos;ll check we can reach you before anything is charged.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[160px] flex-1">
              <span className="text-xs font-semibold text-slate-700">Pincode</span>
              <input
                value={pincode}
                onChange={(e) => {
                  setPincode(e.target.value);
                  setAreaCheck({ state: "idle" });
                }}
                inputMode="numeric"
                className={inputCls()}
                placeholder="600020"
              />
            </label>
            <button
              type="button"
              onClick={handleCheckArea}
              disabled={areaCheck.state === "checking"}
              className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-900 disabled:opacity-60"
            >
              {areaCheck.state === "checking" ? "Checking..." : "Check"}
            </button>
          </div>

          {areaCheck.state === "error" && (
            <p className="text-sm text-red-600">{areaCheck.message}</p>
          )}

          {areaCheck.state === "serviceable" && (
            <>
              <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
                <i className="fa-solid fa-circle-check mr-1.5" />
                Yes - we visit {areaCheck.areaName ? `${areaCheck.areaName}, ` : ""}
                {areaCheck.city}.
                {areaCheck.travelFeePaise > 0 && !selectedPackage?.travel_fee_included && (
                  <span>
                    {" "}
                    Travel to this area is ₹
                    {formatRupees(areaCheck.travelFeePaise)} per visit.
                  </span>
                )}
                {selectedPackage?.travel_fee_included && <span> Travel is included.</span>}
              </p>

              <div id="hv-address">
                <AddressForm value={address} onChange={setAddress} />
              </div>

              {error && (
            <p data-form-error role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

              <button
                type="button"
                onClick={goToStep2}
                className="w-full rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700"
              >
                Continue
              </button>
            </>
          )}

          {areaCheck.state === "unserviceable" && (
            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  We don&apos;t visit {normalizePincode(pincode)} yet.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  Leave your number and we&apos;ll tell you the moment we do. Nothing has been
                  charged.
                </p>
              </div>

              {waitlistJoined ? (
                <p className="text-sm font-semibold text-teal-800">
                  <i className="fa-solid fa-circle-check mr-1.5" />
                  Thanks - we&apos;ll be in touch.
                </p>
              ) : (
                <>
                  <input
                    value={waitlistName}
                    onChange={(e) => setWaitlistName(e.target.value)}
                    className={inputCls()}
                    placeholder="Your name"
                  />
                  <PhoneNumberField value={waitlistPhone} onChange={setWaitlistPhone} />
                  {waitlistError && <p className="text-sm text-red-600">{waitlistError}</p>}
                  <button
                    type="button"
                    onClick={handleJoinWaitlist}
                    className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700"
                  >
                    Tell me when you do
                  </button>
                </>
              )}

              <p className="text-xs text-amber-800">
                In the meantime, an{" "}
                <Link href="/book" className="font-semibold underline">
                  online consultation
                </Link>{" "}
                is available anywhere.
              </p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">When suits you?</h2>
            <p className="mt-1 text-sm text-slate-600">
              Home visits need at least {leadTimeHours}{" "}
              hours&apos; notice so a therapist can
              reach you.
            </p>
            {timezone && (
              <p className="mt-1 text-xs text-slate-500">Times shown in {timezone}.</p>
            )}
          </div>

          <div id="hv-slot">
          <BookingCalendar
            selectedDateKey={bookDate}
            onSelect={(dateKey) => {
              setBookDate(dateKey);
              setAutoPicked((p) => ({ ...p, date: false }));
              const hours = bookableHoursForDate(dateKey, nowMs, leadTimeMs);
              if (bookHour === "" || !hours.includes(Number(bookHour))) {
                setBookHour(hours[0] ?? "");
              }
            }}
            nowMs={nowMs}
            autoSelected={autoPicked.date}
            leadTimeMs={leadTimeMs}
          />
          </div>

          <SelectableChipGroup
            options={hourOptions}
            value={bookHour === "" ? "" : String(bookHour)}
            onChange={(v) => {
              setBookHour(Number(v));
              setAutoPicked((p) => ({ ...p, hour: false }));
            }}
            label="Arrival time"
            idPrefix="hv-hour"
            autoSelectedValue={autoPicked.hour && bookHour !== "" ? String(bookHour) : null}
            emptyMessage="No times left on this date - pick another day."
          />

          {error && (
            <p data-form-error role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goToStep3}
              className="flex-1 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">About you</h2>
          </div>

          {/* The visit was chosen on Step 1, where its price, its length and
              whether travel is added could all be read. Here it is a
              statement with a way back, not a second control over the same
              value -- and it renders whether or not there was a choice to
              make, which the old dropdown did not: with one sellable package
              it was absent entirely and the patient reached the payment
              screen never having seen what they were buying. */}
          {selectedOption && (
            <ChosenServiceSummary
              option={selectedOption}
              compact
              actions={
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  Change
                </button>
              }
            />
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Full name</span>
            <input
              id="hv-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls()}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Email</span>
            <input
              id="hv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoggedIn}
              className={inputCls()}
            />
          </label>

          {!isLoggedIn && (
            <>
              <PhoneNumberField value={phone} onChange={setPhone} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Password</span>
                  <input
                    id="hv-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls()}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Confirm password</span>
                  <input
                    id="hv-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputCls()}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">
                  Referral code <span className="font-normal text-slate-500">(optional)</span>
                </span>
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  onBlur={async () => setReferralCheck(await checkReferralCode(referralCode))}
                  className={inputCls()}
                />
                {referralCheck.status === "valid" && (
                  <span className="mt-1 block text-[11px] text-teal-700">
                    Referred by {referralCheck.hospitalName ?? "your hospital"}.
                  </span>
                )}
                {referralCheck.status === "invalid" && (
                  <span className="mt-1 block text-[11px] text-amber-700">
                    We don&apos;t recognise that code - you can still continue.
                  </span>
                )}
              </label>
            </>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              What&apos;s going on? <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <input
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              className={inputCls()}
              placeholder="Lower back pain since a fall"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              Anything else we should know?{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputCls()}
            />
          </label>

          <label className="flex items-start gap-2">
            <input
              id="hv-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              I confirm this address is correct and I&apos;m happy for a physiotherapist to visit
              me here at the time I selected.
            </span>
          </label>

          {error && (
            <p data-form-error role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goToStep4}
              className="flex-1 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && selectedPackage && total && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Review and pay</h2>
          </div>

          <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Package</dt>
              <dd className="text-right font-semibold text-slate-900">
                {selectedPackage.title}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Visits</dt>
              <dd className="text-right text-slate-700">
                {selectedPackage.visit_count} × {selectedPackage.visit_duration_minutes} min
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">First visit</dt>
              <dd className="text-right text-slate-700">
                {bookDate && formatDateKeyLong(bookDate)},{" "}
                {slotDateTime && formatSlotTime(new Date(slotDateTime).toISOString(), timezone)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Address</dt>
              <dd className="max-w-[60%] text-right text-slate-700">
                {address.line1}
                {address.landmark ? `, near ${address.landmark}` : ""}, {address.pincode}
              </dd>
            </div>
          </dl>

          <dl className="space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Package price</dt>
              <dd className="text-slate-900">
                ₹{formatRupees(total.packagePricePaise)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                Travel
                {selectedPackage.visit_count > 1 && total.travelLabel === "added" && (
                  <span className="text-slate-500"> × {selectedPackage.visit_count} visits</span>
                )}
              </dt>
              <dd className="text-slate-900">
                {total.travelLabel === "included"
                  ? "Included"
                  : total.travelLabel === "none"
                    ? "Free"
                    : `₹${formatRupees((total.totalPaise - total.packagePricePaise))}`}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-2">
              <dt className="font-bold text-slate-900">Total</dt>
              <dd className="font-display text-lg font-bold text-slate-900">
                ₹{formatRupees(total.totalPaise)}
              </dd>
            </div>
          </dl>

          {cashEnabled && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700">How would you like to pay?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMode("prepaid")}
                  className={`rounded-xl border p-3 text-left text-xs transition ${
                    paymentMode === "prepaid"
                      ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="block font-bold text-slate-900">Pay online now</span>
                  <span className="mt-1 block text-slate-500">
                    Confirmed faster - a locked-in therapist doesn&apos;t need admin approval.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("cash")}
                  className={`rounded-xl border p-3 text-left text-xs transition ${
                    paymentMode === "cash"
                      ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="block font-bold text-slate-900">Pay at the door</span>
                  <span className="mt-1 block text-slate-500">
                    Nothing charged now. Your therapist collects cash at the visit.
                  </span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <p data-form-error role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {escapeOpen && (
            <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              {justUnlocked
                ? "Your account is ready."
                : paymentMode === "cash"
                  ? "Something's not going through."
                  : "Payment isn't going through."}{" "}
              Your details are saved - you can{" "}
              <Link href="/patient/dashboard" className="font-semibold underline">
                try again from your dashboard
              </Link>{" "}
              whenever you&apos;re ready.
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              {loading
                ? paymentMode === "cash"
                  ? "Booking..."
                  : "Opening payment..."
                : paymentMode === "cash"
                  ? `Book - pay ₹${formatRupees(total.totalPaise)} at the door`
                  : `Pay ₹${formatRupees(total.totalPaise)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
