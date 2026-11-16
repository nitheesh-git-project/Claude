import ImpersonationGate from "@/components/system/ImpersonationGate";
import TutorialGate from "@/components/tutorial/TutorialGate";
import DashboardExtrasGate from "@/components/dashboard/extras/DashboardExtrasGate";
import TermsGate from "@/components/legal/TermsGate";

// Exists for one reason: the banner that says an admin is signed in as this
// patient. Every screen below renders exactly what they see, which is the
// point of the feature and precisely why the one difference has to sit above
// all of them rather than inside a shell each page renders for itself.
export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The dashboard tutorial: opens by itself on a first visit, and from any
  // (i) afterwards. Mounted here so it survives moving between pages.
  return (
    <ImpersonationGate>
      {/* Announcements for this role, and the person's private notebook:
          read once here, drawn by DashboardShell on every screen below. */}
      {/* "Agree to continue" until this person has agreed to the Terms in
          force (src/components/legal/TermsGate.tsx). */}
      <TermsGate>
        <DashboardExtrasGate role="patient">
          <TutorialGate role="patient">{children}</TutorialGate>
        </DashboardExtrasGate>
      </TermsGate>
    </ImpersonationGate>
  );
}
