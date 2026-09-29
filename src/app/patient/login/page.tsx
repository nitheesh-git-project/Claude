import type { Metadata } from "next";
import PatientAuthCard from "@/components/auth/PatientAuthCard";

export const metadata: Metadata = {
  title: "Patient Portal | MoveRestore | Physiotherapy",
};

export default function PatientLoginPage() {
  return <PatientAuthCard />;
}
