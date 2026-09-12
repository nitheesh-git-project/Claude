"use client";

import Link from "@/components/system/ProgressLink";
import { useAccountDestination } from "@/lib/useAccountDestination";

/**
 * The one deliberate way out of the booking wizard.
 *
 * It sits outside the wizard rather than inside it, so it shows for every
 * one of the wizard's states -- loading, in progress, wrong account, paid --
 * without being repeated four times, and clear of the wizard's own
 * Back/Continue controls so it cannot be hit by mistake.
 *
 * It used to always read **Back to Home**, which is right for a visitor who
 * arrived from the marketing site and wrong for the commonest case by far:
 * a patient who came from their own dashboard to book. Sending them to the
 * public home page puts the marketing site between them and the screen they
 * started on.
 *
 * So the label follows the account. Signed out, it still says Back to Home
 * and goes there. Signed in, it names where that account actually lands --
 * which for an unapproved patient mid-booking is the pending-approval
 * screen, not a dashboard they would bounce off. `useAccountDestination()`
 * is that rule, shared with the public Navbar so the two cannot grow
 * different answers.
 */
export default function BookingExitLink({
  // Where a signed-out visitor goes, which differs per wizard: /book came
  // from the home page, /book-home-visit from the Home Visit page. A
  // signed-in account's destination is the same either way, because it is
  // about the account rather than about where they came in.
  signedOutHref = "/",
  signedOutLabel = "Back to Home",
}: {
  signedOutHref?: string;
  signedOutLabel?: string;
} = {}) {
  const { destination } = useAccountDestination();
  const href = destination?.href ?? signedOutHref;
  const label =
    destination === null
      ? signedOutLabel
      : destination.label === "Go to Dashboard"
        ? "Back to Dashboard"
        : destination.label;

  return (
    <div className="mt-6 flex justify-end">
      <Link
        href={href}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-white hover:text-teal-700"
      >
        <i aria-hidden className="fa-solid fa-arrow-left text-[10px]"></i>
        {label}
      </Link>
    </div>
  );
}
