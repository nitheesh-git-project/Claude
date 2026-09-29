import type { Metadata } from "next";
import TherapistAuthCard from "@/components/auth/TherapistAuthCard";

export const metadata: Metadata = {
  title: "Therapist Network | MoveRestore",
};

export default function TherapistLoginPage() {
  return <TherapistAuthCard />;
}
