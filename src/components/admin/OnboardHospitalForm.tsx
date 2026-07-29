"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardHospitalForm({
  lead,
}: {
  lead: { id: string; name: string; org_details: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    password: string;
    referralCode: string;
  } | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/onboard-hospital", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        email: formData.get("email"),
        organizationName: formData.get("organizationName"),
        fullName: formData.get("fullName"),
        revenueSharePercent: formData.get("revenueSharePercent"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not onboard. Please try again.");
      return;
    }
    setResult(data);
  }

  if (result) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs space-y-1.5">
        <p className="font-bold text-teal-900">
          Hospital account created — save these now, they won&apos;t be shown
          again:
        </p>
        <p>
          <span className="text-slate-500">Email:</span>{" "}
          <strong>{result.email}</strong>
        </p>
        <p>
          <span className="text-slate-500">Temporary Password:</span>{" "}
          <strong>{result.password}</strong>
        </p>
        <p>
          <span className="text-slate-500">Referral Code:</span>{" "}
          <strong>{result.referralCode}</strong>
        </p>
        <button
          onClick={() => router.refresh()}
          className="mt-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Onboard as Hospital
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs"
    >
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <label className="block font-semibold mb-1">Contact Full Name</label>
        <input
          name="fullName"
          defaultValue={lead.name}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">Login Email</label>
        <input
          type="email"
          name="email"
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">Organization Name</label>
        <input
          name="organizationName"
          defaultValue={lead.org_details ?? ""}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">
          Hospital&apos;s Revenue Share (%)
          <span className="font-normal text-slate-400">
            {" "}
            — the rest goes to the company
          </span>
        </label>
        <input
          type="number"
          name="revenueSharePercent"
          min={0}
          max={100}
          step="0.01"
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-2 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition"
        >
          {loading ? "Creating..." : "Create Hospital Account"}
        </button>
      </div>
    </form>
  );
}
