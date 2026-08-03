"use client";

import { useState } from "react";

export default function BookingEnquiryForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="p-8 text-center">
        <i className="fa-solid fa-circle-check text-teal-600 text-4xl mb-4"></i>
        <h2 className="text-xl font-bold text-slate-900">
          Request Received
        </h2>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          We&apos;ll confirm your slot and send payment details by email or
          WhatsApp within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="p-8 space-y-5 text-sm"
    >
      <div>
        <label className="block font-semibold mb-1.5 text-slate-900">
          Full Name
        </label>
        <input
          type="text"
          placeholder="Jane Doe"
          required
          className="w-full p-3 rounded-xl border border-slate-300"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1.5 text-slate-900">
            Email
          </label>
          <input
            type="email"
            placeholder="jane@example.com"
            required
            className="w-full p-3 rounded-xl border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1.5 text-slate-900">
            WhatsApp / Phone
          </label>
          <input
            type="tel"
            placeholder="+1 555 123 4567"
            required
            className="w-full p-3 rounded-xl border border-slate-300"
          />
        </div>
      </div>

      <div>
        <label className="block font-semibold mb-1.5 text-slate-900">
          Your Timezone
        </label>
        <select className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 font-medium">
          <option>Asia/Kolkata (IST)</option>
          <option>America/New_York (EST)</option>
          <option>Europe/London (GMT)</option>
          <option>Asia/Dubai (GST)</option>
          <option>Other</option>
        </select>
      </div>

      <div>
        <label className="block font-semibold mb-1.5 text-slate-900">
          Primary Concern
        </label>
        <select className="w-full p-3 rounded-xl border border-slate-300 bg-white">
          <option>Lower Back Stiffness / Sciatica</option>
          <option>Post-Op Knee Replacement</option>
          <option>Shoulder Impingement</option>
          <option>Sports Injury</option>
          <option>Other</option>
        </select>
      </div>

      <div>
        <label className="block font-semibold mb-1.5 text-slate-900">
          Anything else we should know?{" "}
          <span className="font-normal text-slate-500 text-xs">
            (optional)
          </span>
        </label>
        <textarea
          rows={3}
          placeholder="Briefly describe your pain, injury, or goals"
          className="w-full p-3 rounded-xl border border-slate-300"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg flex justify-center items-center gap-2"
      >
        Request Booking (₹1,999 INR) <i className="fa-solid fa-arrow-right"></i>
      </button>
      <p className="text-[11px] text-slate-400 text-center">
        We&apos;ll reach out to confirm your slot and take payment securely —
        online self-checkout is coming soon.
      </p>
    </form>
  );
}
