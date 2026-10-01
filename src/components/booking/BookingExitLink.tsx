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
 * and goes there. Signed in, it names where that account actually lands.
 * `useAccountDestination()` is that rule, shared with the public Navbar so
 * the two cannot grow different answers.
 *
 * **Except one, and it was shipped here as though it were the design.** This
 * file used to say the right destination for an unapproved patient mid-booking
 * was the pending-approval screen. It is not, and the account is unapproved
 * for a reason that has nothing to do with waiting on anybody: a patient who
 * signs up *inside this wizard* is unapproved **by construction**, and
 * `/api/razorpay/create-order` flips `approved` the moment they genuinely
 * attempt checkout, precisely so they land in their dashboard rather than on
 * a waiting screen. So between Step 2 creating the account and Step 3 taking
 * the payment, the one control on the payment screen read **"Approval
 * pending"** -- telling somebody their account is awaiting approval at the
 * exact moment they are about to pay, which reads as "you cannot do this" and
 * offers, as its only way out, a dead-end screen that abandons the booking.
 *
 * A patient mid-booking is not waiting on approval. They are mid-purchase. So
 * the pending-approval destination is **not offered here** -- they get the
 * ordinary way back instead. The public Navbar still names it, correctly: out
 * on the marketing site an unapproved account really would be bounced there,
 * and the label naming the real destination is the rule that exists.
 *
 * **Suspended is deliberately still named.** That is not a state somebody is
 * about to leave by paying -- checkout will refuse them -- so saying nothing
 * would leave them tapping a button that cannot work.
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

  // Not offered mid-booking, for the reason above: this account is unapproved
  // because it was made here seconds ago, and paying is what approves it.
  const offersWaitingScreen = destination?.href === "/pending-approval";
  const usable = offersWaitingScreen ? null : destination;

  const href = usable?.href ?? signedOutHref;
  const label =
    usable === null
      ? signedOutLabel
      : usable.label === "Go to Dashboard"
        ? "Back to Dashboard"
        : usable.label;

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
