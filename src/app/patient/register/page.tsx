import { Suspense } from "react";
import type { Metadata } from "next";
import InviteRegisterCard from "@/components/auth/InviteRegisterCard";

export const metadata: Metadata = {
  title: "Complete Your Registration | MoveRestore | Physiotherapy",
};

export default function PatientRegisterPage() {
  return (
    <Suspense fallback={null}>
      <InviteRegisterCard />
    </Suspense>
  );
}
