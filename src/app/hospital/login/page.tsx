import type { Metadata } from "next";
import HospitalLoginCard from "@/components/auth/HospitalLoginCard";

export const metadata: Metadata = {
  title: "Partner Login | Dr. Pooja's Physio",
};

export default function HospitalLoginPage() {
  return <HospitalLoginCard />;
}
