"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import SignInLinkResult from "@/components/admin/SignInLinkResult";

export default function OnboardHospitalForm({
  lead,
}: {
  lead: { id: string; name: string; email: string | null; org_details: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharePercent, setSharePercent] = useState("");
  const [result, setResult] = useState<{
    email: string;
    referralCode: string;
    linkPath: string | null;
    warning?: string;
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

  const fieldCls = "w-full p-2 rounded-lg border border-slate-300";
  const labelCls =
    "block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1";

  const parsedShare = Number(sharePercent);
  const companyPercent =
    sharePercent.trim() !== "" && !Number.isNaN(parsedShare) && parsedShare >= 0 && parsedShare <= 100
      ? 100 - parsedShare
      : null;

  if (result) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs space-y-2">
        <p className="font-bold text-teal-900">Hospital account created.</p>
        <p>
          <span className="text-slate-500">Email:</span> <strong>{result.email}</strong>
          {" · "}
          <span className="text-slate-500">Referral Code:</span>{" "}
          <strong>{result.referralCode}</strong>
        </p>
        {/* No password: the partner sets their own with this one-time link,
            and the clinic keeps no copy. A lost link is replaced from the
            partner's card under Partners. */}
        {result.linkPath ? (
          <SignInLinkResult email={result.email} linkPath={result.linkPath} />
        ) : (
          <p className="text-amber-800">
            {result.warning ?? "A sign-in link could not be made. Send one from their card."}
          </p>
        )}
        <button
          onClick={() => router.refresh()}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
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
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
    >
      {error && <p className="text-red-600">{error}</p>}
      {/* Two-up from `sm`, with the same uppercase field labels every other
          admin form uses. Four full-width boxes stacked inside a lead card read
          as an overflow of the card rather than as a form, which is what was
          reported alongside the lead's own run-on details line. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Contact full name</span>
          <input
            name="fullName"
            defaultValue={lead.name}
            required
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Login email</span>
          <input
            type="email"
            name="email"
            defaultValue={lead.email ?? ""}
            required
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Organisation name</span>
          <input
            name="organizationName"
            defaultValue={lead.org_details ?? ""}
            required
            className={fieldCls}
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Prefilled from the enquiry - check it, since that box is free text.
          </span>
        </label>
        <label className="block">
          <span className={labelCls}>Hospital&apos;s revenue share (%)</span>
          <input
            type="number"
            name="revenueSharePercent"
            min={0}
            max={100}
            step="0.01"
            required
            value={sharePercent}
            onChange={(e) => setSharePercent(e.target.value)}
            className={fieldCls}
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            {/* The other half of the split, stated rather than left to be
                worked out -- the same affordance TherapistRevenueShareForm
                gives, on the one field here that decides money. */}
            {companyPercent === null
              ? "The rest goes to the clinic."
              : `The clinic keeps ${companyPercent}%.`}
          </span>
        </label>
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
