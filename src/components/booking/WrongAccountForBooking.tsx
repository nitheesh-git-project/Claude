"use client";

import { createClient } from "@/lib/supabase/client";

export type NonPatientRole = "therapist" | "hospital" | "admin";

/**
 * Shown in place of the booking wizard when the signed-in account is not a
 * patient.
 *
 * One auth user carries exactly one role (`profiles.id` is the auth user's
 * id and `role` is a single column), so a therapist or hospital cannot also
 * be the patient a booking is for. Letting them book anyway produced a
 * session none of their own dashboards could show them -- the therapist
 * dashboard lists sessions by `therapist_id`, the hospital dashboard lists
 * referrals, and the proxy bounces a non-patient away from
 * /patient/dashboard -- so they could pay and then never find it again.
 *
 * Each role gets the route that is actually theirs: a hospital refers rather
 * than books, an admin books on a patient's behalf from the Sessions
 * section, and a therapist has no booking route at all. Signing out and
 * booking as a patient stays available to everyone, because a clinician
 * wanting therapy themselves is a real case -- it just needs its own patient
 * account on its own email.
 */
const COPY: Record<
  NonPatientRole,
  {
    label: string;
    noun: string;
    body: string;
    action: { href: string; label: string; icon: string };
  }
> = {
  therapist: {
    // Carries its own article: "a therapist" but "an admin".
    label: "a therapist",
    noun: "therapist",
    body: "Sessions are booked under a patient account, so this one can't book. If you're booking therapy for yourself, sign out and book with a separate patient account.",
    action: {
      // /dashboard, not the role's own path: this component ships in the
      // booking page's bundle, and a literal /admin/dashboard here would put
      // the back office's address in front of every visitor who opens it.
      // The redirect resolves the role server-side.
      href: "/dashboard",
      label: "Go to my dashboard",
      icon: "fa-gauge-high",
    },
  },
  hospital: {
    label: "a hospital partner",
    noun: "hospital partner",
    body: "Partners don't book sessions directly — you refer a patient and we take it from there, or share your referral code so they can book themselves.",
    action: {
      href: "/dashboard?hash=refer",
      label: "Refer a patient",
      icon: "fa-user-plus",
    },
  },
  admin: {
    label: "an admin",
    noun: "admin",
    body: "To book for a patient, use New Booking under Sessions in the dashboard — it books on their behalf and can override the lead time.",
    action: {
      href: "/dashboard?section=sessions",
      label: "Book for a patient",
      icon: "fa-calendar-plus",
    },
  },
};

export default function WrongAccountForBooking({
  role,
  name,
  email,
}: {
  role: NonPatientRole;
  name: string;
  email: string;
}) {
  const copy = COPY[role];

  async function signOutAndBook() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A hard navigation so the browser sends a fresh request guaranteed to
    // carry the now-cleared auth cookies -- the same reasoning as
    // DashboardShell's own sign-out.
    window.location.href = "/book";
  }

  return (
    <div className="p-8">
      <div className="text-center">
        <i className="fa-solid fa-user-shield mb-4 text-4xl text-teal-600" />
        <h2 className="text-xl font-bold text-slate-900">
          You&apos;re signed in as {copy.label}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          {copy.body}
        </p>
      </div>

      {(name || email) && (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
          Signed in as <span className="font-semibold text-slate-700">{name || email}</span>
          {name && email ? ` (${email})` : ""}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <a
          href={copy.action.href}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          <i aria-hidden="true" className={`fa-solid ${copy.action.icon}`} />
          {copy.action.label}
        </a>
        <button
          type="button"
          onClick={signOutAndBook}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          <i aria-hidden="true" className="fa-solid fa-right-from-bracket" />
          Sign out and book
        </button>
      </div>

      {/* Stated before the click, not after: signing out here is not a
          neutral "switch accounts" -- there is no way back into the {noun}
          session without logging in again, and anything in progress behind
          this tab goes with it. */}
      <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-amber-700">
        <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
        {/* One template literal rather than text-around-an-expression: JSX
            drops the whitespace either side of the interpolation here, which
            rendered as "your therapistsession". */}
        <span>
          {`Signing out ends your ${copy.noun} session — you'll need to log back in to return to it.`}
        </span>
      </p>
    </div>
  );
}
