import { DEFAULT_CONTACT_PHONE } from "@/lib/adminSettings";

/** The clinic's phone as a page read it: the number, not set up, or a read
 *  that failed (said as such, never as "no number"). */
export type ClinicPhoneRead = { status: "ok"; phone: string } | { status: "unset" } | { status: "unreadable" };

/** From the site settings row the page already read (Brand & Contact). */
export function clinicPhoneRead(settings: { contactPhone?: string | null } | null, readFailed: boolean): ClinicPhoneRead {
  if (readFailed) return { status: "unreadable" };
  const phone = (settings?.contactPhone ?? "").trim();
  if (!phone || phone === DEFAULT_CONTACT_PHONE) return { status: "unset" };
  return { status: "ok", phone };
}

/**
 * A calm next step beside anything that asks a patient to pay attention (a
 * "Needs attention" status, a high fall risk, a flagged reading): one plain
 * line and a 44px Call button with the clinic's number. When the number is
 * not set up or could not be read, it says so honestly instead of drawing a
 * button that goes nowhere.
 */
export default function CallClinicLine({ message, phone, tone = "amber" }: { message: string; phone: ClinicPhoneRead; tone?: "amber" | "slate" }) {
  const box = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={`mt-3 flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${box}`} data-testid="call-clinic-line">
      <p className="text-base leading-snug">{message}</p>
      {phone.status === "ok" ? (
        <a
          href={`tel:${phone.phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-base font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 print:hidden"
        >
          <i aria-hidden className="fa-solid fa-phone text-sm" />
          Call the clinic
          <span className="sr-only"> on {phone.phone}</span>
        </a>
      ) : (
        <p className="text-sm text-slate-700">
          {phone.status === "unreadable"
            ? "We couldn't load the clinic's phone number just now. Please try again in a moment, or tell your physiotherapist at your next session."
            : "The clinic's phone number isn't set up here yet. Tell your physiotherapist at your next session, or contact the clinic the way you usually do."}
        </p>
      )}
    </div>
  );
}
