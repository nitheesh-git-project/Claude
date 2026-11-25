import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import ChatToBook from "@/components/patient/ChatToBook";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { chatCareOptions } from "@/lib/chatToBook";

export const metadata: Metadata = {
  title: "Chat to book | MoveRestore",
};

// The booking questions as a short tap-only chat. It offers exactly what the
// Book hub offers (same catalog, same prices, home visits only where the
// clinic has a home-visit price) and hands off to the wizard for the time,
// details and payment -- see ChatToBook.
export default async function Page() {
  const d = await loadPatientDashboard("chat");
  const care = chatCareOptions(d.bookableCategories ?? [], d.hubHomeVisitConditions ?? []);
  const same = d.homeSameAgain;
  const firstName = d.profile?.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <PatientDashboardShell
      data={d}
      title="Chat to book"
      subtitle="A few taps, then pick a time. Nothing to type."
    >
      <ChatToBook
        firstName={firstName}
        care={care}
        lastTherapist={
          same?.therapistId && same.therapistName
            ? { id: same.therapistId, name: same.therapistName, categoryId: same.categoryId }
            : null
        }
      />
    </PatientDashboardShell>
  );
}
