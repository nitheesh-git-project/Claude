import type { Metadata } from "next";
import Link from "next/link";
import TherapistDetailContent from "@/components/admin/TherapistDetailContent";

export const metadata: Metadata = {
  title: "Therapist Details | Dr. Pooja's Physio",
};

export default async function AdminTherapistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <section className="py-8 max-w-4xl mx-auto px-4">
      <Link
        href="/admin/dashboard"
        className="text-xs text-teal-700 font-semibold mb-6 inline-block"
      >
        ← Back to Dashboard
      </Link>
      <TherapistDetailContent id={id} />
    </section>
  );
}
