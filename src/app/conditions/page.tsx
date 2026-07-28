import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Treated | Dr. Pooja's Physio",
  description:
    "Specialized virtual rehabilitation programs for spine & posture issues and post-surgical recovery.",
};

const categories = [
  {
    label: "Category 1",
    title: "Spine & Posture Rehabilitation",
    points: [
      "Sciatica & radiating leg pain protocols",
      "Lumbar disc herniation management",
      "Desk worker neck & upper back decompression",
    ],
    cta: "Book Spine Assessment",
  },
  {
    label: "Category 2",
    title: "Post-Surgical Rehabilitation",
    points: [
      "ACL & knee ligament recovery milestones",
      "Total knee and hip replacement follow-ups",
      "Rotator cuff post-op range of motion restoration",
    ],
    cta: "Book Post-Op Consultation",
  },
];

export default function ConditionsPage() {
  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-teal-900 text-white p-8 rounded-2xl mb-10 shadow-lg">
        <h1 className="text-3xl font-extrabold">
          Specialized Virtual Rehabilitation Programs
        </h1>
        <p className="text-teal-100 mt-2 text-sm max-w-2xl">
          Clinical assessment and personalized exercise therapy designed for
          high recovery success over video calls.
        </p>
      </div>
      <div className="space-y-8">
        {categories.map((cat) => (
          <div
            key={cat.title}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid md:grid-cols-3 gap-6 items-center"
          >
            <div className="md:col-span-2">
              <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                {cat.label}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">
                {cat.title}
              </h2>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                {cat.points.map((p) => (
                  <li key={p}>
                    <i className="fa-solid fa-circle-check text-teal-600 mr-2"></i>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-slate-900">
                ₹1,999 INR{" "}
                <span className="text-xs text-slate-500 font-normal">
                  / session
                </span>
              </p>
              <Link
                href="/book"
                className="mt-3 inline-block w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition text-center"
              >
                {cat.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
