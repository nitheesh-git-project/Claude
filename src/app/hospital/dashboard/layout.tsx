import ImpersonationGate from "@/components/system/ImpersonationGate";
import TutorialGate from "@/components/tutorial/TutorialGate";

// Exists for one reason: the banner that says an admin is signed in as this
// hospital. Every screen below renders exactly what they see, which is the
// point of the feature and precisely why the one difference has to sit above
// all of them rather than inside a shell each page renders for itself.
export default function HospitalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The dashboard tutorial: opens by itself on a first visit, and from any
  // (i) afterwards. Mounted here so it survives moving between pages.
  return (
    <ImpersonationGate>
      <TutorialGate role="hospital">{children}</TutorialGate>
    </ImpersonationGate>
  );
}
