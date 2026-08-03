import type { Metadata } from "next";
import BookingEnquiryForm from "@/components/BookingEnquiryForm";

export const metadata: Metadata = {
  title: "Book a Session | Dr. Pooja's Physio",
  description: "Book your virtual physical therapy session.",
};

export default function BookPage() {
  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-100 min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
          <div className="bg-slate-900 text-white p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block mb-1">
              Booking Enquiry
            </span>
            <h1 className="text-xl font-bold">
              Book Virtual Physical Therapy Session
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              ₹1,999 INR • 1-Hour HD Video Call & Custom Rehab Plan
            </p>
          </div>
          <BookingEnquiryForm />
        </div>
      </div>
    </section>
  );
}
