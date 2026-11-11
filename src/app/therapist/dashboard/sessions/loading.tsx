import DashboardLoading from "@/components/dashboard/DashboardLoading";

// The dashboard's frame with the loader, while this screen's data is read.
// Per screen rather than one loading.tsx for the whole dashboard: a parent
// loading boundary streams every page under it, and a streamed page cannot
// answer 404 any more -- so the patient pages (assessment/[patientId],
// health-profile/[patientId]) have none, and a therapist with no link to the
// patient keeps getting a real 404, never a 200 "not found" page.
export default function Loading() {
  return <DashboardLoading />;
}
