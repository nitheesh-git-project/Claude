import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import PayNowButton from "@/components/PayNowButton";
import CancelSessionButton from "@/components/CancelSessionButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import BuyPackageButton from "@/components/BuyPackageButton";
import BookWithPackageForm from "@/components/BookWithPackageForm";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Patient Dashboard | Dr. Pooja's Physio",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, category_id, duration_minutes, therapist_id, patient_rating, patient_feedback, refund_status, package_purchase_id, no_show"
    )
    .eq("patient_id", user.id)
    .order("created_at", { ascending: false });

  // Unpaid bookings won't have amount_paid_paise set yet (that's only
  // recorded once a payment order is created), so fall back to the linked
  // category's price, or the flat base fee if there's no category. Looked
  // up via the admin client (not the active-only public policy) so this
  // always matches what /api/razorpay/create-order will actually charge,
  // even for a category that's since been deactivated.
  const categoryIds = [
    ...new Set((appointments ?? []).map((a) => a.category_id).filter(Boolean)),
  ];
  const admin = createAdminClient();
  const { data: categoryPrices } =
    categoryIds.length > 0
      ? await admin
          .from("treatment_categories")
          .select("id, price_paise")
          .in("id", categoryIds as string[])
      : { data: [] as { id: string; price_paise: number }[] };
  const categoryPriceMap = new Map(
    (categoryPrices ?? []).map((c) => [c.id, c.price_paise])
  );

  // A patient can read their own appointment rows via RLS, but not the
  // linked therapist's profile (that policy only allows a user to read
  // their own row) — so the assigned therapist's name has to be looked up
  // here via the admin client, same pattern as the therapist dashboard
  // looking up its patients' names.
  const therapistIds = [
    ...new Set((appointments ?? []).map((a) => a.therapist_id).filter(Boolean)),
  ];
  const { data: therapists } =
    therapistIds.length > 0
      ? await admin.from("profiles").select("id, full_name").in("id", therapistIds as string[])
      : { data: [] as { id: string; full_name: string }[] };
  const therapistMap = new Map((therapists ?? []).map((t) => [t.id, t.full_name]));

  const { data: activeCategories } = await supabase
    .from("treatment_categories")
    .select("id, title")
    .eq("active", true);
  const activeCategoryMap = new Map((activeCategories ?? []).map((c) => [c.id, c.title]));

  const { data: availablePackages } = await supabase
    .from("treatment_category_packages")
    .select("id, category_id, title, session_count, price_paise")
    .eq("active", true)
    .order("display_order", { ascending: true });

  const { data: ownedPackages } = await supabase
    .from("patient_package_purchases")
    .select("id, category_id, session_count, sessions_used")
    .eq("patient_id", user.id)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });

  return (
    <section className="py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <AvatarThumbnail
            url={profile?.avatar_url}
            name={profile?.full_name ?? "P"}
            size={48}
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome back, {profile?.full_name ?? "there"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Your virtual physical therapy dashboard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/patient/dashboard/profile"
            className="text-xs font-semibold text-slate-500 hover:text-teal-700 transition"
          >
            Edit Profile
          </Link>
          <SignOutButton />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-slate-800">Your Sessions</h2>
          <Link
            href="/book"
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
          >
            Book New Session
          </Link>
        </div>

        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            You don&apos;t have any sessions yet. Book your first consultation
            to get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="p-4 rounded-xl border border-slate-200 text-xs space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-900">
                      {a.concern ?? "General Consultation"}
                    </p>
                    <p className="text-slate-500 mt-1">
                      {formatSlotTime(a.slot_time, a.timezone)}
                      {a.duration_minutes && ` • ${a.duration_minutes} min`}
                    </p>
                    <p className="text-slate-500 mt-1">
                      Therapist:{" "}
                      <strong className="text-slate-700">
                        {a.therapist_id
                          ? therapistMap.get(a.therapist_id) ?? "Unknown"
                          : "Not yet assigned"}
                      </strong>
                    </p>
                    {a.package_purchase_id && (
                      <p className="text-teal-700 mt-1">Paid via package</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`capitalize font-semibold px-3 py-1 rounded-full ${
                        STATUS_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {a.status}
                    </span>
                    {a.status === "cancelled" ? (
                      a.refund_status === "processed" ? (
                        <span className="font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                          Refunded
                        </span>
                      ) : (
                        a.refund_status === "not_eligible" && (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            No Refund
                          </span>
                        )
                      )
                    ) : a.payment_status === "unpaid" ? (
                      <PayNowButton
                        appointmentId={a.id}
                        name={profile?.full_name ?? ""}
                        email={profile?.email ?? ""}
                        description={a.concern ?? "Virtual Physical Therapy Session"}
                        amountPaise={
                          a.amount_paid_paise ??
                          (a.category_id ? categoryPriceMap.get(a.category_id) : undefined) ??
                          SESSION_FEE_PAISE
                        }
                      />
                    ) : (
                      <span className="font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full">
                        Paid
                      </span>
                    )}
                  </div>
                </div>
                {(a.status === "requested" || a.status === "confirmed") && (
                  <CancelSessionButton
                    appointmentId={a.id}
                    paid={a.payment_status === "paid"}
                    slotTime={a.slot_time}
                  />
                )}
                {a.status === "completed" && !a.no_show && (
                  <SessionFeedbackForm
                    appointmentId={a.id}
                    role="patient"
                    existingRating={a.patient_rating}
                    existingFeedback={a.patient_feedback}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ownedPackages && ownedPackages.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
          <h2 className="font-bold text-lg text-slate-800 mb-4">Your Packages</h2>
          <ul className="space-y-3">
            {ownedPackages.map((p) => {
              const remaining = p.session_count - p.sessions_used;
              return (
                <li
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-bold text-slate-900">
                        {activeCategoryMap.get(p.category_id) ?? "General Consultation"}
                      </p>
                      <p className="text-slate-500 mt-1">
                        {remaining} of {p.session_count} sessions remaining
                      </p>
                    </div>
                    {remaining > 0 && <BookWithPackageForm packagePurchaseId={p.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {availablePackages && availablePackages.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Session Packages</h2>
          <p className="text-xs text-slate-500 mb-4">
            Buy a bundle of sessions upfront and use them one at a time,
            whenever you&apos;re ready to book.
          </p>
          <ul className="space-y-3">
            {availablePackages.map((pkg) => (
              <li
                key={pkg.id}
                className="p-4 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-2 flex-wrap"
              >
                <div>
                  <p className="font-bold text-slate-900">{pkg.title}</p>
                  <p className="text-slate-500 mt-1">
                    {activeCategoryMap.get(pkg.category_id) ?? "General Consultation"} •{" "}
                    {pkg.session_count} sessions • ₹
                    {(pkg.price_paise / pkg.session_count / 100).toFixed(0)}/session
                  </p>
                </div>
                <BuyPackageButton
                  packageId={pkg.id}
                  name={profile?.full_name ?? ""}
                  email={profile?.email ?? ""}
                  description={pkg.title}
                  priceInPaise={pkg.price_paise}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
