import type { Metadata } from "next";
import HospitalLoginCard from "@/components/auth/HospitalLoginCard";

export const metadata: Metadata = {
  title: "Partner Login | MoveRestore | Physiotherapy",
};

export default function HospitalLoginPage() {
  return <HospitalLoginCard />;
}
