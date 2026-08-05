import type { Metadata } from "next";
import HospitalInquiryForm from "@/components/HospitalInquiryForm";
import { Reveal } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "For Hospitals (B2B) | Dr. Pooja's Physio",
  description:
    "Extend your post-discharge care virtually with structured rehabilitation for out-of-town patients.",
};

export default function HospitalsPage() {
  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="bg-slate-900 text-white p-8 sm:p-12 rounded-3xl shadow-xl grid md:grid-cols-2 gap-8 items-center">
        <div>
          <span className="bg-teal-500/20 text-teal-300 text-xs font-bold px-3 py-1 rounded-full border border-teal-500/30">
            B2B Hospital Partnership
          </span>
          <h1 className="font-display text-3xl font-bold mt-4">
            Extend Your Post-Discharge Care Virtually
          </h1>
          <p className="text-slate-300 text-sm mt-3 leading-relaxed">
            Hospitals lose contact with out-of-town patients post-surgery. We
            provide structured virtual rehabilitation, ensuring patient
            recovery continuity while updating referring surgeons.
          </p>
        </div>
        <div className="bg-white text-slate-800 p-6 rounded-2xl shadow-lg">
          <HospitalInquiryForm />
        </div>
      </Reveal>
    </section>
  );
}
