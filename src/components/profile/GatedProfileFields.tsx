"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FieldConfig = {
  name: string;
  label: string;
  type: "text" | "date" | "number" | "select";
  options?: string[];
};

type LatestRequest = {
  id: string;
  status: "pending" | "declined" | "approved";
  admin_notes: string | null;
  changes: Record<string, unknown>;
} | null;

export default function GatedProfileFields({
  userId,
  fields,
  currentValues,
  latestRequest,
}: {
  userId: string;
  fields: FieldConfig[];
  currentValues: Record<string, string>;
  latestRequest: LatestRequest;
}) {
  const [values, setValues] = useState<Record<string, string>>(currentValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const isPending = latestRequest?.status === "pending";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const changes: Record<string, string | number | null> = {};
    for (const f of fields) {
      const rawNew = (values[f.name] ?? "").trim();
      const rawOld = (currentValues[f.name] ?? "").trim();
      if (rawNew === rawOld) continue;

      if (f.type === "number") {
        const n = rawNew === "" ? null : Number(rawNew);
        changes[f.name] = n === null || Number.isNaN(n) ? null : n;
      } else {
        changes[f.name] = rawNew === "" ? null : rawNew;
      }
    }

    if (Object.keys(changes).length === 0) {
      setError("You haven't changed anything yet.");
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase
      .from("profile_change_requests")
      .insert({ user_id: userId, changes });
    setLoading(false);

    if (insertError) {
      setError("Could not submit your request. Please try again.");
      return;
    }
    setSubmitted(true);
    router.refresh();
  }

  if (submitted || isPending) {
    const fieldsInFlight = submitted
      ? Object.keys(values).filter((k) => values[k]?.trim() !== (currentValues[k] ?? "").trim())
      : Object.keys(latestRequest?.changes ?? {});
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
        <p className="font-bold mb-1">Changes Pending Review</p>
        <p>
          {fieldsInFlight.length > 0
            ? `You've requested a change to: ${fieldsInFlight
                .map((f) => fields.find((fc) => fc.name === f)?.label ?? f)
                .join(", ")}. `
            : ""}
          An admin will review this shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {latestRequest?.status === "declined" && latestRequest.admin_notes && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800">
          <p className="font-bold">Your last change request was declined</p>
          <p className="mt-1">{latestRequest.admin_notes}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
          {error}
        </div>
      )}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="block font-semibold mb-1">{f.label}</label>
          {f.type === "select" ? (
            <select
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
            >
              <option value="">— Not set —</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.type}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="w-full p-2.5 rounded-lg border border-slate-300"
            />
          )}
        </div>
      ))}
      <p className="text-[11px] text-slate-400">
        Changes to these fields need admin approval before they take effect.
      </p>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition"
      >
        {loading ? "Submitting..." : "Request Changes"}
      </button>
    </form>
  );
}
