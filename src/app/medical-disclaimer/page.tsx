import LegalPage, { legalMetadata } from "@/components/legal/LegalPage";

// Content lives in src/lib/legal/legalDocs.ts; see legalFacts.ts for the
// owner-supplied facts it needs.
export const revalidate = 300;

export function generateMetadata() {
  return legalMetadata("medical-disclaimer");
}

export default function Page() {
  return <LegalPage slug="medical-disclaimer" />;
}
