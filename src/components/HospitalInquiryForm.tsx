"use client";

import { useState } from "react";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import PhoneNumberField from "@/components/PhoneNumberField";

const SOURCES = ["Ads", "Friends", "Hospitals", "Other"];

export default function HospitalInquiryForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!isValidStoredPhone(phone)) {
      setError("Please enter a valid phone number.");
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);

    // Posts to a route rather than inserting straight into b2b_leads. The
    // table's public insert policy is gone: a browser-side insert cannot be
    // rate limited, and this form is the one on the site with no account
    // behind it.
    try {
      const res = await fetch("/api/hospitals/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          source: formData.get("source"),
          orgDetails: formData.get("org_details") || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not submit your inquiry. Please try again.");
        return;
      }
    } catch {
      // A request that dies on a bad connection has to say so -- left
      // unhandled it put nothing on screen and read as a dead button.
      setError("Could not reach us just now. Please check your connection and try again.");
      return;
    } finally {
      setLoading(false);
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
        <label className="block">
          <span className="block font-semibold mb-1">Your Name</span>
          <input
            type="text"
            name="name"
            placeholder="Dr. V. Sharma"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </label>
        <PhoneNumberField value={phone} onChange={setPhone} required />
        <label className="block">
          <span className="block font-semibold mb-1">Email Address</span>
          <input
            type="email"
            name="email"
            placeholder="dr.sharma@hospital.com"
            required
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">
            How did you hear about us?
          </span>
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
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">
            Official Details{" "}
            <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea
            name="org_details"
            rows={2}
            placeholder="Hospital/clinic name, role, official email..."
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </label>
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
