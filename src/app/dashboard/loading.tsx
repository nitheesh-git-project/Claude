import RouteLoading from "@/components/system/RouteLoading";

// The hop from "Go to Dashboard" to the caller's own dashboard. Shown while
// the role is read, so the tap lands straight on the loader rather
// than on an empty public page. This route has no sidebar of its own, so
// unlike the dashboards it can keep a loading boundary.
export default function Loading() {
  return <RouteLoading label="Opening your dashboard…" fullScreen />;
}
