import DashboardLoading from "@/components/dashboard/DashboardLoading";

// Sent the moment the dashboard is asked for, before any of its data is
// read: the dashboard's own frame with the loader in it. See
// DashboardLoading for why the frame, and not a bare loader.
//
// It lives in the (home) route group, not at the dashboard's root, so it
// wraps the home screen alone: a root loading boundary would stream every
// page under the dashboard, and the patient pages must still answer a real
// 404 to a therapist who is not on that patient's care.
export default function Loading() {
  return <DashboardLoading />;
}
