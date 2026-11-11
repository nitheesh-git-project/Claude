import DashboardLoading from "@/components/dashboard/DashboardLoading";

// Sent the moment the dashboard is asked for, before any of its data is
// read: the dashboard's own frame with the loader in it. See
// DashboardLoading for why the frame, and not a bare loader.
export default function Loading() {
  return <DashboardLoading />;
}
