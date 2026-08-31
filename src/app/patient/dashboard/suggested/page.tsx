import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import CarePlanOfferCard from "@/components/packages/CarePlanOfferCard";
import PatientSuggestionCard from "@/components/packages/PatientSuggestionCard";
import CarePlanHistory from "@/components/therapist/CarePlanHistory";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Suggested Sessions | Dr. Pooja's Physio",
};

// Everything waiting on the patient's answer, in one place.
//
// Two different things live here and they are deliberately not merged: a
// **recommendation** is a programme to buy, written by a therapist after
// seeing you; a **proposed time** is a slot on a programme you already own.
// One costs money and the other does not, so they are separate sections
// with separate wording rather than one list of "suggestions".
//
// The proposed times used to render on Overview only, which meant a
// therapist's proposal was invisible from every other screen and had no
// history. They move here, where a patient looking for "what needs me"
// finds both.
export default async function Page() {
  const d = await loadPatientDashboard("suggested");

  const plan = d.activeCarePlan;
  const version = plan?.version ?? null;

  // The author's name, which RLS cannot give a patient
  // (profiles_select_own) -- the same admin-client lookup every dashboard
  // already makes for a therapist's name.
  const admin = createAdminClient();
  const authorIds = new Set<string>(d.carePlanHistory.map((v) => v.authoredBy));
  if (plan) authorIds.add(plan.therapistId);
  const authorNames = new Map<string, string>();
  if (authorIds.size > 0) {
    const { data: authors } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...authorIds]);
    for (const a of authors ?? []) authorNames.set(a.id, a.full_name);
  }

  // Loaded only when there is a home-visit recommendation waiting, and in
  // its own call: the card needs somewhere to deliver to before it can take
  // payment, and every other patient on this screen would be paying for a
  // query they never render.
  const needsAddress = version?.offerKind === "home_visit_package";
  const { data: addressRows } = needsAddress
    ? await admin
        .from("patient_addresses")
        .select("id, label, line1, city, pincode")
        .eq("patient_id", d.user.id)
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; label: string | null; line1: string; city: string | null; pincode: string }[] };

  const nothingWaiting = !version && d.pendingSuggestions.length === 0;

  return (
    <PatientDashboardShell
      data={d}
      title="Suggested Sessions"
      subtitle="What your therapist has recommended, and times they've proposed."
    >
      {nothingWaiting && (
        <div className="mt-8">
          <SurfaceCard title="Nothing waiting on you" icon="fa-lightbulb">
            <EmptyState
              icon="fa-lightbulb"
              title="No recommendations right now"
              body="After a session, your therapist may recommend a programme of treatment. It will appear here for you to accept or decline — nothing is ever charged without you choosing it."
            />
          </SurfaceCard>
        </div>
      )}

      {version && plan && (
        <div id="recommendation" className="mt-8">
          <CarePlanOfferCard
            offer={{
              planId: plan.id,
              planStatus: plan.status,
              versionId: version.id,
              therapistName: authorNames.get(plan.therapistId) ?? "Your therapist",
              offerSnapshot: version.offerSnapshot,
              handsOnRequired: version.handsOnRequired,
              frequencyPerWeek: version.frequencyPerWeek,
              clinicalRationale: version.clinicalRationale,
              instructions: version.instructions,
              expiresAt: version.expiresAt,
              isHomeVisit: version.offerKind === "home_visit_package",
            }}
            patientName={d.profile?.full_name ?? ""}
            patientEmail={d.profile?.email ?? ""}
            savedAddresses={addressRows ?? []}
            // Resolved on the server so the card's state cannot flip
            // between render and hydration.
            nowMs={d.nowMs}
          />
        </div>
      )}

      {d.pendingSuggestions.length > 0 && (
        <div id="proposed-times" className="mt-8">
          <SurfaceCard
            title="Times your therapist has proposed"
            icon="fa-calendar-plus"
            subtitle="These are on a programme you already own — accepting books the time and uses one of your sessions. Nothing extra to pay."
          >
            <div className="space-y-3">
              {d.pendingSuggestions.map((suggestion) => (
                <PatientSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  leadTimeHours={d.adminSettings.onlineBookingLeadTimeHours}
                />
              ))}
            </div>
          </SurfaceCard>
        </div>
      )}

      {d.carePlanHistory.length > 0 && (
        <div id="past-recommendations" className="mt-8">
          <CarePlanHistory
            versions={d.carePlanHistory}
            authorNames={authorNames}
            voice="patient"
          />
        </div>
      )}
    </PatientDashboardShell>
  );
}
