import DashboardLoading from "@/components/dashboard/DashboardLoading";

// Sent the moment the back office is asked for, before any of its data is
// read: the dashboard frame (AdminShell uses the same rail and sidebar
// sizes) with the loader in it. The intercepted detail overlays keep their
// own sheet-shaped wait in @modal/loading.tsx.
export default function Loading() {
  return <DashboardLoading label="Loading the dashboard…" />;
}
