import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import PayNowButton from "@/components/PayNowButton";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Patient Dashboard | Dr. Pooja's Physio",
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
      "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, category_id, duration_minutes"
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
                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {a.concern ?? "General Consultation"}
                  </p>
                  <p className="text-slate-500 mt-1">
                    {formatSlotTime(a.slot_time, a.timezone)}
                    {a.duration_minutes && ` • ${a.duration_minutes} min`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="capitalize font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                    {a.status}
                  </span>
                  {a.payment_status === "unpaid" ? (
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
