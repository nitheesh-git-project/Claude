import type { Metadata } from "next";
import PatientAuthCard from "@/components/auth/PatientAuthCard";

export const metadata: Metadata = {
  title: "Patient Portal | Dr. Pooja's Physio",
};

export default function PatientLoginPage() {
  return <PatientAuthCard />;
}
