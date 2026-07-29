"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SubmitReferralForm({
  hospitalId,
}: {
  hospitalId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const { error } = await supabase.from("patient_referrals").insert({
      hospital_id: hospitalId,
      patient_name: formData.get("patient_name") as string,
      address: (formData.get("address") as string) || null,
      preferred_language: (formData.get("preferred_language") as string) || null,
      medical_issue: formData.get("medical_issue") as string,
      treatment_needed: (formData.get("treatment_needed") as string) || null,
    });

    setLoading(false);
    if (error) {
      setError("Could not submit the referral. Please try again.");
      return;
    }
    setSuccess(true);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {error && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-3">
          Referral submitted — our team will review and reach out.
        </div>
      )}

      <div>
        <label className="block font-semibold mb-1">Patient Full Name</label>
        <input
          name="patient_name"
          required
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">Address</label>
          <input
            name="address"
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">
            Preferred Language
          </label>
          <input
            name="preferred_language"
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </div>
      </div>
      <div>
        <label className="block font-semibold mb-1">Medical Issue</label>
        <textarea
          name="medical_issue"
          rows={2}
          required
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">
          Treatment Needed{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          name="treatment_needed"
          rows={2}
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
      >
        {loading ? "Submitting..." : "Submit Referral"}
      </button>
    </form>
  );
}
