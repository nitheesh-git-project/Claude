import type { Metadata } from "next";
import Link from "next/link";
import ConditionDetailContent from "@/components/admin/ConditionDetailContent";

export const metadata: Metadata = {
  title: "Patient Condition | Dr. Pooja's Physio",
};

export default async function AdminConditionDetailPage({
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
      <ConditionDetailContent id={id} />
    </section>
  );
}
