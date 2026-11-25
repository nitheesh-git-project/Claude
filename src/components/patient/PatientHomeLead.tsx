import type { CSSProperties } from "react";
import ProgressLink from "@/components/system/ProgressLink";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";
import { formatSlotTime } from "@/lib/formatSlotTime";
import type { HomeProgramme, SameAgain } from "@/lib/patientHomeCards";

export const CHAT_TO_BOOK_HREF = "/patient/dashboard/chat";

const RING_R = 38;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * The top of a patient's Home, under the next-session headline: the shortest
 * way to the thing most patients come here to do -- book their next session.
 *
 *  - **My programme**: progress and how many paid sessions are left to book,
 *    one tap to My programme where those are scheduled.
 *  - **Same again?**: the care they last had, with the physiotherapist they
 *    had it with, one tap into the booking wizard with both filled in.
 *  - **Something new** and **Chat to book**: the two ways to start from
 *    scratch -- the step-by-step booking, or the tap-only chat.
 *
 * A patient with neither a programme nor a past session sees one large
 * "Book your first session" card instead of the first two.
 */
export default function PatientHomeLead({
  programme,
  sameAgain,
}: {
  programme: HomeProgramme | null;
  sameAgain: SameAgain | null;
}) {
  const both = !!programme && !!sameAgain;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {programme && <ProgrammeCard programme={programme} wide={!both} />}
      {sameAgain && <SameAgainCard sameAgain={sameAgain} wide={!both} delay={both ? 80 : 0} />}
      {!programme && !sameAgain && <FirstBookingCard />}
      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        <Tile
          href={BOOKING_FROM_DASHBOARD}
          icon="fa-plus"
          title={programme || sameAgain ? "Something new" : "Step by step"}
          hint="Video or home visit"
          delay={140}
        />
        <Tile href={CHAT_TO_BOOK_HREF} icon="fa-comment-medical" title="Chat to book" hint="Tap answers, no typing" delay={180} />
      </div>
    </div>
  );
}

function ProgrammeCard({ programme, wide }: { programme: HomeProgramme; wide: boolean }) {
  const done = programme.total > 0 ? programme.completed / programme.total : 0;
  const ringStyle = { "--ring-len": `${RING_LEN}` } as CSSProperties;
  return (
    <section
      aria-labelledby="home-programme-title"
      className={`mr-rise flex flex-col gap-4 rounded-2xl bg-teal-700 p-5 text-white shadow-sm sm:p-6 ${wide ? "sm:flex-row sm:items-center lg:col-span-2" : ""}`}
    >
      {/* Ring and words stay side by side at every width; only the button
          moves -- beside them on a full-width card, under them on a half. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-4">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" className="h-[72px] w-[72px] shrink-0 min-[400px]:h-[88px] min-[400px]:w-[88px]">
        <circle cx="44" cy="44" r={RING_R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="9" />
        <circle
          className="mr-ring-fill"
          style={ringStyle}
          cx="44"
          cy="44"
          r={RING_R}
          fill="none"
          stroke="#99f6e4"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - done)}
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="50" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="800" className="font-display">
          {programme.completed}/{programme.total}
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-100">My programme</p>
        <h2 id="home-programme-title" className="mt-1 text-xl font-bold leading-snug">
          {programme.title}
        </h2>
        <p className="mt-1 text-sm text-teal-50">
          {programme.completed} of {programme.total} done
          {programme.therapistName ? ` · with ${programme.therapistName}` : ""}
        </p>
        <p className="mt-1 text-base font-semibold">
          {programme.toBook > 0
            ? `${programme.toBook} paid ${programme.toBook === 1 ? "session" : "sessions"} left to book`
            : programme.scheduled > 0
              ? "Every session is booked"
              : "All sessions used"}
        </p>
      </div>
      </div>
      <ProgressLink
        href="/patient/dashboard/packages"
        className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-base font-bold text-teal-800 transition hover:bg-teal-50 ${programme.toBook > 0 ? "mr-breathe" : ""}`}
      >
        {programme.toBook > 0 ? "Book your next session" : "See my programme"}
        <i aria-hidden className="fa-solid fa-arrow-right text-sm" />
      </ProgressLink>
    </section>
  );
}

function SameAgainCard({ sameAgain, wide, delay }: { sameAgain: SameAgain; wide: boolean; delay: number }) {
  const first = sameAgain.therapistName?.replace(/^Dr\.?\s+/i, "").split(" ")[0] ?? null;
  return (
    <section
      aria-labelledby="home-same-again-title"
      style={{ "--d": `${delay}ms` } as CSSProperties}
      className={`mr-rise flex flex-col gap-4 rounded-2xl border-2 border-teal-600 bg-white p-5 shadow-sm sm:p-6 ${wide ? "lg:col-span-2" : ""}`}
    >
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-700">Same again?</p>
        <h2 id="home-same-again-title" className="mt-1 text-xl font-bold leading-snug text-slate-900">
          {sameAgain.title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {sameAgain.therapistName ? `With ${sameAgain.therapistName} · ` : ""}
          Last time {formatSlotTime(sameAgain.lastSlotTime, sameAgain.lastTimezone)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <ProgressLink
          href={sameAgain.href}
          className="mr-breathe inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-base font-bold text-white transition hover:bg-teal-800 sm:flex-none"
        >
          Book this again
          <i aria-hidden className="fa-solid fa-arrow-right text-sm" />
        </ProgressLink>
      </div>
      {first && (
        <p className="text-[13px] text-slate-500">
          We ask for {first} again. The clinic confirms who is free at the time you pick.
        </p>
      )}
    </section>
  );
}

function FirstBookingCard() {
  return (
    <section
      aria-labelledby="home-first-booking-title"
      className="mr-rise flex flex-col gap-4 rounded-2xl bg-teal-700 p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:col-span-2"
    >
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-100">Start here</p>
        <h2 id="home-first-booking-title" className="mt-1 text-xl font-bold leading-snug">
          Book your first session
        </h2>
        <p className="mt-1 text-base text-teal-50">Pick a time. Your physiotherapist takes it from there.</p>
      </div>
      <ProgressLink
        href={BOOKING_FROM_DASHBOARD}
        className="mr-breathe inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-base font-bold text-teal-800 transition hover:bg-teal-50"
      >
        <i aria-hidden className="fa-solid fa-plus text-sm" />
        Book a session
      </ProgressLink>
    </section>
  );
}

function Tile({ href, icon, title, hint, delay }: { href: string; icon: string; title: string; hint: string; delay: number }) {
  return (
    <ProgressLink
      href={href}
      style={{ "--d": `${delay}ms` } as CSSProperties}
      className="mr-rise group flex min-h-[88px] flex-col justify-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-start sm:gap-3"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
        <i aria-hidden className={`fa-solid ${icon}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-bold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
    </ProgressLink>
  );
}
