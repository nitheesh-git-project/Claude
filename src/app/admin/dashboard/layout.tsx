import type { ReactNode } from "react";

// Adds the @modal parallel slot so the patients/[id] and therapists/[id]
// routes can be intercepted (see @modal/(.)patients and @modal/(.)therapists)
// and rendered as an in-portal overlay instead of a full navigation when
// reached via a Link click from elsewhere in the dashboard -- Bug 10.
// Direct/hard navigation to those URLs still renders the real page, since
// interception only applies to client-side (soft) navigation.
export default function AdminDashboardLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
