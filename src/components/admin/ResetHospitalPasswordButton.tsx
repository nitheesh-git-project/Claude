"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatIST } from "@/lib/formatIST";

export default function ResetHospitalPasswordButton({
  hospitalId,
  currentPassword,
  currentPasswordSetAt,
}: {
  hospitalId: string;
  currentPassword?: string | null;
  currentPasswordSetAt?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ password: string; setAt: string } | null>(
    currentPassword ? { password: currentPassword, setAt: currentPasswordSetAt ?? "" } : null
  );
  const [copied, setCopied] = useState(false);
  const router = useRouter();

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
    setCopied(false);
    setResult({ password: data.password, setAt: new Date().toISOString() });
    router.refresh();
  }

  if (result) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs space-y-1.5">
        <p className="font-bold text-teal-900">
          Current admin-set password{" "}
          <span className="font-normal text-teal-700">
            (visible here until the hospital sets their own)
          </span>
          :
        </p>
        <p>
          <span className="text-slate-500">Password:</span>{" "}
          <strong className="font-mono">{result.password}</strong>
        </p>
        {result.setAt && <p className="text-teal-700">Set {formatIST(result.setAt)}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.password);
              setCopied(true);
            }}
            className="bg-teal-700 hover:bg-teal-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
          >
            {copied ? "Copied!" : "Copy Password"}
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
          >
            {loading ? "Resetting..." : "Generate New Password"}
          </button>
        </div>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
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
