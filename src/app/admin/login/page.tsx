import type { Metadata } from "next";
import AdminLoginCard from "@/components/auth/AdminLoginCard";

export const metadata: Metadata = {
  title: "Admin Login | Dr. Pooja's Physio",
  // Kept out of search results. The page has to stay reachable -- it is the
  // only way in for a real admin -- but there is no reason for the back
  // office to be indexed or listed. The title stays honest: anyone reading
  // it has already opened the page deliberately.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLoginPage() {
  return <AdminLoginCard />;
}
