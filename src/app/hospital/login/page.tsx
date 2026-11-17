import type { Metadata } from "next";
import HospitalLoginCard from "@/components/auth/HospitalLoginCard";
import { phoneLoginOffered } from "@/lib/phoneLoginServer";

export const metadata: Metadata = {
  title: "Partner Login | MoveRestore",
};

export default async function HospitalLoginPage() {
  return <HospitalLoginCard phoneEnabled={await phoneLoginOffered()} />;
}
