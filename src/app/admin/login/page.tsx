import type { Metadata } from "next";
import AdminLoginCard from "@/components/auth/AdminLoginCard";

export const metadata: Metadata = {
  title: "Admin Login | Dr. Pooja's Physio",
};

export default function AdminLoginPage() {
  return <AdminLoginCard />;
}
