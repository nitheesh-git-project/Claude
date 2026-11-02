import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import FinishBookingCard, { type FinishBookingDraft } from "@/components/booking/FinishBookingCard";
import { createPublicClient } from "@/lib/supabase/public";
import { DEFAULT_ADMIN_SETTINGS, SITE_SETTINGS_SELECT, parseAdminSettings } from "@/lib/adminSettings";
import { whatsappHref, telHref } from "@/lib/contactLinks";
import { approvalWaitPhrase, approvalWaitWorkingDays } from "@/lib/clinicPromises";
import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";

export const metadata: Metadata = {
  title: "Approval Pending | MoveRestore",
};

// Both self-serve roles land here now - a therapist waiting on their
// application review, and a patient waiting on their new account being
// approved. The wording is the only difference, so this reads the role
// rather than duplicating the whole screen per role. A signed-out visitor
// (someone who signed out and came back to the link, say) gets the neutral
// copy.
export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  // A patient who signed up inside a booking wizard is not waiting on an
  // admin: their account opens when they pay (or run out of payment tries).
  // Show them the booking they left unpaid and the way to finish it, not a
  // review screen that would never end. A /patient/register signup has no
  // such marker and keeps the screen below.
  if (user && role === "patient" && user.user_metadata?.signup_source === "booking") {
    const nowIso = new Date().toISOString();
    const [{ data: draftRow }, { data: daysRow }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, slot_time, concern")
        .eq("patient_id", user.id)
        .eq("status", "requested")
        .eq("payment_status", "unpaid")
        .eq("visit_mode", "online")
        .gt("slot_time", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      createPublicClient()
        .from("site_settings")
        .select("abandoned_booking_account_days")
        .maybeSingle(),
    ]);
    const days =
      typeof daysRow?.abandoned_booking_account_days === "number"
        ? daysRow.abandoned_booking_account_days
        : DEFAULT_ADMIN_SETTINGS.abandonedBookingAccountDays;
    const keptUntil = user.created_at
      ? formatClinicDate(new Date(new Date(user.created_at).getTime() + days * 86_400_000))
      : null;
    const draft: FinishBookingDraft | null = draftRow
      ? {
          appointmentId: draftRow.id,
          whenLabel: formatClinicDateTime(draftRow.slot_time),
          concern: draftRow.concern ?? "physiotherapy",
        }
      : null;
    return (
      <FinishBookingCard
        draft={draft}
        keptUntilLabel={keptUntil}
        bookHref={draft ? `/book?replaces=${draft.appointmentId}` : "/book"}
      />
    );
  }

  // The wait and the ways to reach the clinic come from settings, never from
  // words typed here: the contact numbers from Brand & Contact (a number left
  // as the shipped placeholder is simply absent, never a dead link), the wait
  // from src/lib/clinicPromises.ts (a default until it has a setting).
  const { data: settingsRow } = await createPublicClient()
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const settings = parseAdminSettings(settingsRow);
  const whatsapp = whatsappHref(settings.whatsappNumber);
  const call = telHref(settings.contactPhone);
  const wait = approvalWaitPhrase(approvalWaitWorkingDays());

  const heading = role === "therapist" ? "Application Received" : "Approval Pending";
  const body =
    role === "therapist"
      ? `Thanks for applying to join the physiotherapist network. The clinic is checking your credentials. You'll get access to your dashboard once the clinic approves your account.`
      : role === "patient"
        ? `Thanks for registering. The clinic is checking your account - ${wait}. You don't have to wait for that: book your first session now and your account opens as you book.`
        : `The clinic is checking your account - ${wait}. You'll get access to your dashboard once it approves.`;
  const contactLink =
    "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800 transition hover:border-teal-500 hover:text-teal-800";

  return (
    <section className="py-16 max-w-lg mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-clock" aria-hidden="true"></i>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
        <p className="text-base text-slate-700 mt-3 leading-relaxed">{body}</p>

        {role === "patient" && (
          <Link
            href="/book"
            data-testid="pending-book-first"
            className="mt-6 flex min-h-12 w-full items-center justify-center bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-4 rounded-xl text-base transition shadow"
          >
            Book your first session
          </Link>
        )}

        <p className="text-base text-slate-700 mt-6 leading-relaxed">
          Questions, or it&apos;s been longer than that? Contact the clinic:
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={contactLink}>
              <i className="fa-solid fa-comment-dots text-teal-700" aria-hidden="true"></i> WhatsApp
            </a>
          )}
          {call && (
            <a href={call} className={contactLink}>
              <i className="fa-solid fa-phone text-teal-700" aria-hidden="true"></i> Call {settings.contactPhone}
            </a>
          )}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={contactLink}>
            <i className="fa-solid fa-envelope text-teal-700" aria-hidden="true"></i> {SUPPORT_EMAIL}
          </a>
        </div>

        <Link
          href="/"
          className={`mt-6 flex min-h-12 w-full items-center justify-center font-bold py-3 px-4 rounded-xl text-base transition ${
            role === "patient"
              ? "bg-slate-100 hover:bg-slate-200 text-slate-800"
              : "bg-slate-800 hover:bg-slate-900 text-white shadow"
          }`}
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
