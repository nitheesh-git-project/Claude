import { Suspense } from "react";
import type { Metadata } from "next";
import BookingWizard from "@/components/BookingWizard";

export const metadata: Metadata = {
  title: "Book a Session | Dr. Pooja's Physio",
  description: "Book your virtual physical therapy session.",
};

export default function BookPage() {
  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-100 min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl mx-auto">
        <Suspense fallback={null}>
          <BookingWizard />
        </Suspense>
      </div>
    </section>
  );
}
