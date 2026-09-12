import ImpersonationGate from "@/components/system/ImpersonationGate";

// Exists for one reason: the banner that says an admin is signed in as this
// hospital. Every screen below renders exactly what they see, which is the
// point of the feature and precisely why the one difference has to sit above
// all of them rather than inside a shell each page renders for itself.
export default function HospitalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ImpersonationGate>{children}</ImpersonationGate>;
}
