import Link from "next/link";
import { resumeCheckoutHref } from "@/lib/resumeCheckout";

export type FinishBookingDraft = {
  appointmentId: string;
  /** Already formatted in the clinic's zone by the server. */
  whenLabel: string;
  concern: string;
};

// What a locked booking account sees on sign-in instead of "Approval
// Pending": the booking it left unpaid, and the two ways forward. **Pay now**
// goes back to the booking wizard's own Step 3 for that booking
// (src/lib/resumeCheckout.ts) -- with the code field and the breakdown, and
// with tries counted exactly as the first attempt counted them -- rather than
// opening Razorpay from here, which offered no way to apply a code again.
export default function FinishBookingCard({
  draft,
  keptUntilLabel,
  bookHref,
}: {
  draft: FinishBookingDraft | null;
  /** When the account is deleted if nothing changes, formatted by the server. */
  keptUntilLabel: string | null;
  bookHref: string;
}) {
  return (
    <section className="py-16 max-w-lg mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg text-center">
        <div className="w-16 h-16 bg-teal-50 text-teal-700 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-calendar-check" aria-hidden="true"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Finish your booking</h1>
        {draft ? (
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your <span className="font-semibold text-slate-800">{draft.concern}</span> session on{" "}
            <span className="font-semibold text-slate-800">{draft.whenLabel}</span>{" "}
            is waiting for payment. Your account opens as soon as it&apos;s paid.
          </p>
        ) : (
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your account opens once your first booking is paid. Pick a time to get started.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {draft && (
              <Link
                href={resumeCheckoutHref(draft.appointmentId)}
                className="block w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow"
              >
                Pay now
              </Link>
            )}
            <Link
              href={bookHref}
              className={`block w-full font-bold py-3 px-4 rounded-xl text-sm transition ${
                draft
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-800"
                  : "bg-teal-700 hover:bg-teal-800 text-white shadow"
              }`}
            >
              {draft ? "Pick another time" : "Book a session"}
            </Link>
          </div>

        {keptUntilLabel && (
          <p className="text-[11px] text-slate-500 mt-5 leading-relaxed">
            If it isn&apos;t paid, this account and its booking are removed after {keptUntilLabel}.
          </p>
        )}
      </div>
    </section>
  );
}
