import type { Metadata } from "next";
import PatientAuthCard from "@/components/auth/PatientAuthCard";

export const metadata: Metadata = {
  title: "Patient Portal | MoveRestore",
};

export default async function PatientLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  // `?tab=register` opens the sign-up side (the bare /patient/register
  // address redirects here with it).
  const { tab } = await searchParams;
  return <PatientAuthCard initialTab={tab === "register" ? "register" : "login"} />;
}
