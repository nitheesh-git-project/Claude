import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import MarkNoShowButton from "@/components/MarkNoShowButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import TherapistAvailabilityRoster from "@/components/TherapistAvailabilityRoster";
import TherapistOnLeaveToggle from "@/components/TherapistOnLeaveToggle";
import TherapistUpcomingOverrides from "@/components/TherapistUpcomingOverrides";
import TherapistPayoutReceiptsSection from "@/components/TherapistPayoutReceiptsSection";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { computeRatingAggregate } from "@/lib/ratingAggregate";
import { buildTherapistPayoutReceipts } from "@/lib/receipts";

const STATUS_BADGE_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

// See patient/dashboard/page.tsx's matching NO_SHOW_STYLE comment -- a
// completed session with no_show=true is otherwise visually identical to
// one that was actually held.
const NO_SHOW_STYLE = "text-orange-700 bg-orange-50";

export const metadata: Metadata = {
  title: "Therapist Dashboard | Dr. Pooja's Physio",
};

export default async function TherapistDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, credentials, avatar_url, revenue_share_percent, rating_visible, timezone")
    .eq("id", user.id)
    .single();

  // Kept as its own query rather than folded into the select above --
  // on_leave is new and migration-dependent, and the query above feeds the
  // whole page header (name, credentials, rating). An unknown-column error
  // there would blank the entire dashboard; isolated, only the On Leave
  // toggle degrades (defaults to "available") until the migration runs.
  const { data: onLeaveProfile } = await supabase
    .from("profiles")
    .select("on_leave")
    .eq("id", user.id)
    .single();

  const { data: availabilitySlots } = await supabase
    .from("therapist_availability_template")
    .select("day_of_week, hour")
    .eq("therapist_id", user.id);

  // Computed in the therapist's OWN timezone, not the server's UTC clock --
  // override dates are plain calendar dates meant to match the therapist's
  // own local "today" (see schema.sql's comment on this table). A UTC-based
  // cutoff would show a just-past override as "upcoming" for hours after
  // local midnight in timezones ahead of UTC, or hide a genuinely-still-
  // upcoming one in timezones behind UTC.
  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: profile?.timezone || "UTC",
  });
  const { data: upcomingOverrides } = await supabase
    .from("therapist_availability_override")
    .select("date, hour, available, note")
    .eq("therapist_id", user.id)
    .gte("date", todayKey);

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, slot_time, timezone, concern, status, duration_minutes, notes, patient_id, therapist_rating, therapist_feedback, no_show, patient_rating, patient_rating_excluded, therapist_payout_batch_id, therapist_payout_amount_paise"
    )
    .eq("therapist_id", user.id)
    .order("created_at", { ascending: false });

  // Kept as its own query rather than folded into the select above for the
  // same reason as onLeaveProfile -- therapist_payout_batches is new and
  // migration-dependent, and an unknown-table error here should only
  // degrade the Payout Receipts section (empty until the migration runs),
  // not blank the whole dashboard.
  const { data: payoutBatches } = await supabase
    .from("therapist_payout_batches")
    .select("id, therapist_id, amount_paise, method, note, created_at")
    .eq("therapist_id", user.id)
    .order("created_at", { ascending: false });

  // What patients rated THIS therapist -- the therapist's own standing,
  // shown to them regardless of whether it's currently visible to the
  // public (rating_visible/site_settings only gate the public /team page
  // and homepage, not what a therapist can see about themselves).
  const ownRating = computeRatingAggregate(
    (appointments ?? []).map((a) => ({
      rating: a.patient_rating,
      excluded: a.patient_rating_excluded,
    }))
  );

  // A therapist can read their own appointment rows via RLS, but not the
  // linked patients' profiles (that policy only allows a user to read
  // their own row) — so their patients' names/contact info have to be
  // looked up here via the admin client, scoped to just the columns
  // needed to actually run the session.
  const patientIds = [...new Set((appointments ?? []).map((a) => a.patient_id))];
  const admin = createAdminClient();
  const { data: patients } =
    patientIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, phone, email")
          .in("id", patientIds)
      : { data: [] as { id: string; full_name: string; phone: string | null; email: string }[] };
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p]));
  const patientNameById = new Map(
    (patients ?? []).map((p) => [p.id, p.full_name ?? "Unknown patient"])
  );

  const payoutReceipts = buildTherapistPayoutReceipts(
    payoutBatches ?? [],
    appointments ?? [],
    patientNameById
  );

  return (
    <section className="py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <AvatarThumbnail
            url={profile?.avatar_url}
            name={profile?.full_name ?? "T"}
            size={48}
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome, {profile?.full_name ?? "there"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">{profile?.credentials}</p>
            {profile?.revenue_share_percent !== null &&
              profile?.revenue_share_percent !== undefined && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Your Revenue Share:{" "}
                  <strong className="text-slate-600">{profile.revenue_share_percent}%</strong>
                </p>
              )}
            <p className="text-[11px] text-slate-400 mt-1">
              Your Rating:{" "}
              {ownRating.average === null ? (
                <strong className="text-slate-600">No ratings yet</strong>
              ) : (
                <strong className="text-slate-600">
                  {ownRating.average.toFixed(1)} ({ownRating.count} rating
                  {ownRating.count === 1 ? "" : "s"})
                </strong>
              )}
              {profile?.rating_visible === false && (
                <span className="text-slate-400"> — hidden from public pages</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/therapist/dashboard/profile"
            className="text-xs font-semibold text-slate-500 hover:text-purple-700 transition"
          >
            Edit Profile
          </Link>
          <SignOutButton />
        </div>
      </div>

      <div className="mb-6">
        <TherapistOnLeaveToggle initialOnLeave={onLeaveProfile?.on_leave ?? false} />
      </div>

      <div className="mb-6">
        <TherapistAvailabilityRoster
          initialSlots={availabilitySlots ?? []}
          timezone={profile?.timezone ?? null}
        />
      </div>

      {upcomingOverrides && upcomingOverrides.length > 0 && (
        <div className="mb-6">
          <TherapistUpcomingOverrides overrides={upcomingOverrides} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Assigned Patient Sessions
        </h2>

        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No sessions have been assigned to you yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => {
              const patient = patientMap.get(a.patient_id);
              return (
                <li
                  key={a.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-bold text-slate-900">
                        {patient?.full_name ?? "Unknown patient"}
                      </p>
                      <p className="text-slate-500">
                        {patient?.phone || patient?.email || "No contact on file"}
                      </p>
                    </div>
                    <span
                      className={`capitalize font-semibold px-3 py-1 rounded-full ${
                        a.no_show ? NO_SHOW_STYLE : STATUS_BADGE_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {a.no_show ? "No-Show" : a.status}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <strong>{a.concern ?? "General Consultation"}</strong> —{" "}
                    {formatSlotTime(a.slot_time, a.timezone)}
                    {a.duration_minutes && ` • ${a.duration_minutes} min`}
                  </p>
                  {a.notes && (
                    <p className="text-slate-500">
                      <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
                    </p>
                  )}
                  {a.status === "confirmed" && (
                    <div className="flex items-center gap-2">
                      <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
                      <MarkNoShowButton appointmentId={a.id} />
                    </div>
                  )}
                  {a.status === "completed" && !a.no_show && (
                    <SessionFeedbackForm
                      appointmentId={a.id}
                      role="therapist"
                      existingRating={a.therapist_rating}
                      existingFeedback={a.therapist_feedback}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TherapistPayoutReceiptsSection receipts={payoutReceipts} />
    </section>
  );
}
