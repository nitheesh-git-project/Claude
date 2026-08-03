"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sanitizePhoneInput } from "@/lib/phoneInput";

const SOURCES = ["Ads", "Friends", "Hospitals", "Other"];

export default function HospitalInquiryForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const { error } = await supabase.from("b2b_leads").insert({
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      source: formData.get("source") as string,
      org_details: (formData.get("org_details") as string) || null,
    });

    setLoading(false);
    if (error) {
      setError("Could not submit your inquiry. Please try again.");
      return;
    }
    setSubmitted(true);
  }

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

      {error && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="block font-semibold mb-1">Your Name</label>
          <input
            type="text"
            name="name"
            placeholder="Dr. V. Sharma"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Phone Number</label>
          <input
            type="tel"
            name="phone"
            placeholder="+91 98765 43210"
            required
            inputMode="tel"
            maxLength={20}
            onInput={sanitizePhoneInput}
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Email Address</label>
          <input
            type="email"
            name="email"
            placeholder="dr.sharma@hospital.com"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">
            How did you hear about us?
          </label>
          <select
            name="source"
            required
            defaultValue=""
            className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="" disabled>
              Select one
            </option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">
            Official Details{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            name="org_details"
            rows={2}
            placeholder="Hospital/clinic name, role, official email..."
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition text-xs"
        >
          {loading ? "Submitting..." : "Submit B2B Inquiry"}
        </button>
      </form>
    </>
  );
}
