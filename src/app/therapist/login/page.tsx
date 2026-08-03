import type { Metadata } from "next";
import TherapistAuthCard from "@/components/auth/TherapistAuthCard";

export const metadata: Metadata = {
  title: "Therapist Network | Dr. Pooja's Physio",
};

export default function TherapistLoginPage() {
  return <TherapistAuthCard />;
}
