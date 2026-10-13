import type { Metadata } from "next";
import Link from "next/link";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import ProgrammeCheckout from "@/components/packages/ProgrammeCheckout";
import type { SavedAddress } from "@/components/packages/CarePlanOfferCard";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConditionCovers } from "@/lib/catalogImageServer";
import {
  carePlanState,
  offerKindFor,
  parseOfferSnapshot,
  type CarePlanStatus,
} from "@/lib/carePlans";
import { readPromoCodesEnabled } from "@/lib/acquisitionSettings";

export const metadata: Metadata = {
  title: "Review & pay | MoveRestore",
};

const SUGGESTED = "/patient/dashboard/suggested";

// Review & pay for a programme a therapist recommended.
//
// "Accept & pay" on the Suggested card used to open Razorpay straight away,
// so a patient holding a promo code had nowhere to type it and nobody read a
// total before the sheet appeared. This page is that missing step, built to
// read like step 3 of the booking wizard: what you are buying, where (for a
// home visit), a code, and a breakdown the server quoted -- then one Pay
// button that opens Razorpay at exactly that figure.
//
// The plan is found among the signed-in patient's own plans
// (loadPatientDashboard reads them by their id), so a version id belonging
// to somebody else simply is not found here -- and the routes behind the Pay
// button check ownership again on their own.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const params = await searchParams;
  const planParam = (Array.isArray(params.plan) ? params.plan[0] : params.plan)?.trim() ?? "";
  const d = await loadPatientDashboard("suggested");

  const active = d.activeCarePlan;
  const version = active?.version && active.version.id === planParam ? active.version : null;
  const pastVersion = version ? null : d.carePlanHistory.find((v) => v.id === planParam) ?? null;

  const shell = (children: React.ReactNode) => (
    <PatientDashboardShell
      data={d}
      title="Review & pay"
      subtitle="Check your programme, add a promo code if you have one, then pay."
    >
      <div className="mt-6">
        <Link
          href={SUGGESTED}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-teal-800"
        >
          <i aria-hidden className="fa-solid fa-arrow-left" />
          Back to Suggested
        </Link>
      </div>
      {children}
    </PatientDashboardShell>
  );

  const admin = createAdminClient();

  // Just paid for. Rendered through the same component as the checkout,
  // because paying marks the plan accepted and the dashboard's realtime
  // refresh then re-renders this page: a different component here would
  // unmount the confirmation and the scheduler the patient is looking at.
  // On a fresh visit the component says "already paid" and links onward.
  const answered = !version && pastVersion?.planStatus === "accepted" && pastVersion.isCurrent;
  if (answered && pastVersion) {
    const { data: author } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", pastVersion.authoredBy)
      .maybeSingle();
    return shell(
      <div className="mt-4">
        <ProgrammeCheckout
          offer={{
            planId: pastVersion.planId,
            planStatus: pastVersion.planStatus,
            versionId: pastVersion.id,
            therapistName: author?.full_name ?? "Your therapist",
            offerSnapshot: pastVersion.offerSnapshot,
            handsOnRequired: pastVersion.handsOnRequired,
            frequencyPerWeek: pastVersion.frequencyPerWeek,
            clinicalRationale: pastVersion.clinicalRationale,
            instructions: pastVersion.instructions,
            expiresAt: null,
            isHomeVisit: offerKindFor(pastVersion.handsOnRequired) === "home_visit_package",
            cover: null,
          }}
          homeVisitEnabled={d.adminSettings.homeVisitEnabled}
          patientName={d.profile?.full_name ?? ""}
          patientEmail={d.profile?.email ?? ""}
          savedAddresses={[]}
          promoCodesEnabled={false}
          nowMs={d.nowMs}
          bulkScheduleMax={d.adminSettings.packageBulkScheduleMax}
          alreadyPaid
        />
      </div>
    );
  }

  // Nothing to pay for: the link is old, the plan was answered, or it is not
  // this patient's. Each is said plainly, with the way back -- never a
  // crash, and never a Pay button the server would refuse.
  if (!version || !active) {
    const pastState = pastVersion
      ? carePlanState({ status: pastVersion.planStatus as CarePlanStatus }, null, d.nowMs)
      : null;
    const title = pastVersion && !pastVersion.isCurrent && pastState === "awaiting_patient"
        ? "Your therapist has updated this recommendation"
        : pastState === "declined"
          ? "You've answered this recommendation"
          : pastVersion
            ? "This recommendation is no longer open"
            : "We couldn't find that recommendation";
    const body = pastVersion && !pastVersion.isCurrent
        ? "The newest version is on Suggested Sessions, with its own price."
        : "Anything your therapist recommends for you is on Suggested Sessions. Nothing has been charged.";
    return shell(
      <div className="mt-4">
        <SurfaceCard title="Review & pay" icon="fa-receipt">
          <EmptyState
            icon="fa-lightbulb"
            title={title}
            body={body}
            action={
              <Link
                href={SUGGESTED}
                className="inline-flex rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Back to Suggested
              </Link>
            }
          />
        </SurfaceCard>
      </div>
    );
  }

  const isHomeVisit = version.offerKind === "home_visit_package";

  // The author's name, which RLS cannot give a patient -- the same lookup
  // the Suggested page makes.
  const { data: author } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", active.therapistId)
    .maybeSingle();

  // Only a home visit needs somewhere to go, so only it pays for this query.
  const { data: addressRows } = isHomeVisit
    ? await admin
        .from("patient_addresses")
        .select("id, label, line1, city, pincode")
        .eq("patient_id", d.user.id)
        .order("created_at", { ascending: false })
    : { data: [] as SavedAddress[] };

  // The condition's photograph as it is now, with the admin's focal point.
  const categoryId = parseOfferSnapshot(version.offerSnapshot)?.categoryId ?? null;
  const cover = categoryId
    ? (await loadConditionCovers(admin, [categoryId])).get(categoryId) ?? null
    : null;

  const promoCodesEnabled = await readPromoCodesEnabled(admin);

  return shell(
    <div className="mt-4">
      <ProgrammeCheckout
        offer={{
          planId: active.id,
          planStatus: active.status,
          versionId: version.id,
          therapistName: author?.full_name ?? "Your therapist",
          offerSnapshot: version.offerSnapshot,
          handsOnRequired: version.handsOnRequired,
          frequencyPerWeek: version.frequencyPerWeek,
          clinicalRationale: version.clinicalRationale,
          instructions: version.instructions,
          expiresAt: version.expiresAt,
          isHomeVisit,
          cover: cover?.src ? cover : null,
        }}
        homeVisitEnabled={d.adminSettings.homeVisitEnabled}
        patientName={d.profile?.full_name ?? ""}
        patientEmail={d.profile?.email ?? ""}
        savedAddresses={(addressRows ?? []) as SavedAddress[]}
        promoCodesEnabled={promoCodesEnabled}
        nowMs={d.nowMs}
        bulkScheduleMax={d.adminSettings.packageBulkScheduleMax}
      />
    </div>
  );
}
