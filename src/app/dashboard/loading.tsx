import RouteLoading from "@/components/system/RouteLoading";

// The hop from "Go to Dashboard" to the caller's own dashboard. Shown while
// the role is read, so the tap lands straight on the same skeleton the
// dashboard itself shows rather than on an empty public page.
export default function Loading() {
  return <RouteLoading label="Loading your dashboard" withSidebar />;
}
