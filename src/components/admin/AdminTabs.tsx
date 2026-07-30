"use client";

import { useState, type ReactNode } from "react";

export default function AdminTabs({
  overview,
  b2bPartners,
  b2bBadgeCount,
  patients,
  therapists,
  siteContent,
}: {
  overview: ReactNode;
  b2bPartners: ReactNode;
  b2bBadgeCount: number;
  patients: ReactNode;
  therapists: ReactNode;
  siteContent: ReactNode;
}) {
  const [tab, setTab] = useState<
    "overview" | "b2b" | "patients" | "therapists" | "content"
  >("overview");

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            tab === "overview"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("b2b")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            tab === "b2b"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          B2B Partners
          {b2bBadgeCount > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {b2bBadgeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("patients")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            tab === "patients"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Patients
        </button>
        <button
          onClick={() => setTab("therapists")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            tab === "therapists"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Therapists
        </button>
        <button
          onClick={() => setTab("content")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            tab === "content"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Site Content
        </button>
      </div>

      <div className={tab === "overview" ? "" : "hidden"}>{overview}</div>
      <div className={tab === "b2b" ? "" : "hidden"}>{b2bPartners}</div>
      <div className={tab === "patients" ? "" : "hidden"}>{patients}</div>
      <div className={tab === "therapists" ? "" : "hidden"}>{therapists}</div>
      <div className={tab === "content" ? "" : "hidden"}>{siteContent}</div>
    </div>
  );
}
