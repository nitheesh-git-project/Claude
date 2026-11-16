import LegalPage, { legalMetadata } from "@/components/legal/LegalPage";
import GrievanceForm from "@/components/legal/GrievanceForm";

// Content lives in src/lib/legal/legalDocs.ts; the form posts to
// /api/grievances and lands on People -> Data requests.
export const revalidate = 300;

export function generateMetadata() {
  return legalMetadata("grievances");
}

export default function Page() {
  return (
    <LegalPage
      slug="grievances"
      after={{ id: "raise-a-complaint", heading: "Raise a complaint", node: <GrievanceForm /> }}
    />
  );
}
