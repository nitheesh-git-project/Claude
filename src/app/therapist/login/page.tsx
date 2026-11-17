import type { Metadata } from "next";
import TherapistAuthCard from "@/components/auth/TherapistAuthCard";
import { phoneLoginOffered } from "@/lib/phoneLoginServer";

export const metadata: Metadata = {
  title: "Therapist Network | MoveRestore",
};

export default async function TherapistLoginPage() {
  return <TherapistAuthCard phoneEnabled={await phoneLoginOffered()} />;
}
