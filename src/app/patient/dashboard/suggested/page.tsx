import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import CarePlanOfferCard from "@/components/packages/CarePlanOfferCard";
import PatientSuggestionCard from "@/components/packages/PatientSuggestionCard";
import CarePlanHistory from "@/components/therapist/CarePlanHistory";
import { createAdminClient } from "@/lib/supabase/admin";
import { readInviteDelivery } from "@/lib/inviteDeliveryServer";
import Link from "next/link";
import { loadConditionCovers } from "@/lib/catalogImageServer";
import { parseOfferSnapshot } from "@/lib/carePlans";
import TabSummary, { JumpChips } from "@/components/dashboard/TabSummary";
import { recommendationsWaiting } from "@/lib/tabSummaries";

export const metadata: Metadata = {
  title: "Recommendations | MoveRestore",
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
  // Whether "the calendar invite follows" is true here (QA F-13): only with
  // Google configured and Meet links on.
  const inviteDelivery = await readInviteDelivery(createAdminClient());

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

  // What the patient just bought, if anything. Without this the screen a
  // patient lands on straight after paying says "No recommendations right
  // now" -- technically true, and a dead end at the exact moment they most
  // want to be told it worked and shown where their sessions are.
  const justPurchased = d.carePlanHistory.find((v) => v.planStatus === "accepted") ?? null;

  const nothingWaiting = !version && d.pendingSuggestions.length === 0;

  // The condition's photograph as it is now, with the admin's focal point --
  // the snapshot froze only the URL.
  const offerCategoryId = version ? parseOfferSnapshot(version.offerSnapshot)?.categoryId ?? null : null;
  const offerCover = offerCategoryId
    ? (await loadConditionCovers(admin, [offerCategoryId])).get(offerCategoryId) ?? null
    : null;

  return (
    <PatientDashboardShell
      data={d}
      title="Recommendations"
      subtitle="What your physiotherapist has recommended, and times they've proposed."
    >
      {/* What is waiting, in one line, with a jump to each part. Only when
          something is: the "Nothing waiting on you" card below already says
          the other case, and saying it twice is noise. */}
      {!nothingWaiting && (
        <>
          <TabSummary
            testId="recommendations-summary"
            eyebrow="Waiting on you"
            tone="hero"
            title={`${recommendationsWaiting(!!version, d.pendingSuggestions.length)} ${
              recommendationsWaiting(!!version, d.pendingSuggestions.length) === 1 ? "thing" : "things"
            } to decide`}
            detail={[
              version && plan ? `A programme from ${authorNames.get(plan.therapistId) ?? "your physiotherapist"}` : null,
              d.pendingSuggestions.length > 0
                ? `${d.pendingSuggestions.length} proposed ${d.pendingSuggestions.length === 1 ? "time" : "times"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            action={
              version
                ? { label: "See the programme", href: "#recommendation", icon: "fa-arrow-down" }
                : { label: "See the times", href: "#proposed-times", icon: "fa-arrow-down" }
            }
          />
          <JumpChips
            className=""
            items={[
              ...(version ? [{ id: "recommendation", label: "Programme" }] : []),
              ...(d.pendingSuggestions.length > 0
                ? [{ id: "proposed-times", label: "Proposed times", count: d.pendingSuggestions.length }]
                : []),
              ...(d.carePlanHistory.length > 0 ? [{ id: "past-recommendations", label: "Past" }] : []),
            ]}
          />
        </>
      )}
      {nothingWaiting && justPurchased && (
        <div className="mt-8">
          <SurfaceCard title="Your programme is ready" info="card:care-plan" icon="fa-circle-check">
            <p className="text-sm text-slate-700">
              Your physiotherapist&apos;s recommendation is paid for. Your sessions are waiting to
              be booked - pick times that suit you.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/patient/dashboard/packages"
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                See your sessions
              </Link>
              <Link
                href="/patient/dashboard/book"
                className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                Book a session
              </Link>
            </div>
          </SurfaceCard>
        </div>
      )}

      {nothingWaiting && !justPurchased && (
        <div className="mt-8">
          <SurfaceCard title="Nothing waiting on you" icon="fa-lightbulb">
            <EmptyState
              icon="fa-lightbulb"
              title="No recommendations right now"
              body="After a session, your physiotherapist may recommend a programme of treatment. It will appear here for you to accept or decline - nothing is ever charged without you choosing it."
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
              therapistName: authorNames.get(plan.therapistId) ?? "Your physiotherapist",
              offerSnapshot: version.offerSnapshot,
              handsOnRequired: version.handsOnRequired,
              frequencyPerWeek: version.frequencyPerWeek,
              clinicalRationale: version.clinicalRationale,
              instructions: version.instructions,
              expiresAt: version.expiresAt,
              isHomeVisit: version.offerKind === "home_visit_package",
              cover: offerCover?.src ? offerCover : null,
            }}
            homeVisitEnabled={d.adminSettings.homeVisitEnabled}
            // Resolved on the server so the card's state cannot flip
            // between render and hydration. Paying happens on the
            // programme's review page (suggested/checkout), which loads the
            // addresses a home visit needs.
            nowMs={d.nowMs}
          />
        </div>
      )}

      {d.pendingSuggestions.length > 0 && (
        <div id="proposed-times" className="mt-8">
          <SurfaceCard
            title="Times your physiotherapist has proposed"
            icon="fa-calendar-plus"
            subtitle="These are on a programme you already own - accepting books the time and uses one of your sessions. Nothing extra to pay."
          >
            <div className="space-y-3">
              {d.pendingSuggestions.map((suggestion) => (
                <PatientSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  leadTimeHours={d.adminSettings.onlineBookingLeadTimeHours}
                  inviteDelivery={inviteDelivery}
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
