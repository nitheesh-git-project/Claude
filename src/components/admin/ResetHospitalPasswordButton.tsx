"use client";

import { useState } from "react";

export default function ResetHospitalPasswordButton({
  hospitalId,
}: {
  hospitalId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    if (
      !window.confirm(
        "This will invalidate the hospital's current password immediately. Continue?"
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/reset-hospital-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hospitalId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not reset password. Please try again.");
      return;
    }
    setResult(data);
  }

  if (result) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs space-y-1.5 mt-2">
        <p className="font-bold text-teal-900">
          New password generated — save this now, it won&apos;t be shown again:
        </p>
        <p>
          <span className="text-slate-500">Email:</span>{" "}
          <strong>{result.email}</strong>
        </p>
        <p>
          <span className="text-slate-500">New Password:</span>{" "}
          <strong>{result.password}</strong>
        </p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(result.password);
            setCopied(true);
          }}
          className="mt-1 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {copied ? "Copied!" : "Copy Password"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleReset}
        disabled={loading}
        className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Resetting..." : "Reset Password"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
