"use client";

import { useState } from "react";

export default function HospitalInquiryForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="text-center py-6">
        <i className="fa-solid fa-circle-check text-teal-600 text-3xl mb-3"></i>
        <p className="font-bold text-slate-900">Inquiry Received</p>
        <p className="text-xs text-slate-500 mt-1">
          We&apos;ll be in touch within 1-2 business days.
        </p>
      </div>
    );
  }

  return (
    <>
      <h3 className="font-bold text-lg text-slate-900 mb-4">
        Request Partnership Deck
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
        className="space-y-3 text-xs"
      >
        <div>
          <label className="block font-semibold mb-1">
            Hospital / Clinic Name
          </label>
          <input
            type="text"
            placeholder="e.g. Apollo Orthopedic Care"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">
            Contact Person & Role
          </label>
          <input
            type="text"
            placeholder="Dr. V. Sharma (Head of Surgery)"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">
            Official Email / WhatsApp
          </label>
          <input
            type="text"
            placeholder="v.sharma@apollo.com"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl transition text-xs"
        >
          Submit B2B Inquiry
        </button>
      </form>
    </>
  );
}
