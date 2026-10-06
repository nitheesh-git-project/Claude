import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import FinishBookingCard, { type FinishBookingDraft } from "@/components/booking/FinishBookingCard";
import { createPublicClient } from "@/lib/supabase/public";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
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
  let profileName = "";
  let profileEmail = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
    profileName = profile?.full_name ?? "";
    profileEmail = profile?.email ?? user.email ?? "";
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
        name={profileName}
        email={profileEmail}
        keptUntilLabel={keptUntil}
        bookHref={draft ? `/book?replaces=${draft.appointmentId}` : "/book"}
      />
    );
  }

  const heading = role === "therapist" ? "Application Received" : "Approval Pending";
  const body =
    role === "therapist"
      ? "Thanks for applying to join the therapist network. Your credentials are being reviewed - you'll get access to your dashboard once an admin approves your account."
      : role === "patient"
        ? "Thanks for registering. Your account is being reviewed - you'll get access to your dashboard, and be able to book sessions, once an admin approves it."
        : "Your account is being reviewed. You'll get access to your dashboard once an admin approves it.";

  return (
    <section className="py-16 max-w-lg mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-clock"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{heading}</h1>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{body}</p>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Questions, or it&apos;s been a while? Reach out at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-700 font-semibold hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow"
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
