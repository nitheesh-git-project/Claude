"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FieldConfig = { name: string; label: string; type: "text" | "tel" | "textarea" };

export default function InstantProfileFields({
  userId,
  fields,
  currentValues,
}: {
  userId: string;
  fields: FieldConfig[];
  currentValues: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(currentValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    const updates: Record<string, string | null> = {};
    for (const f of fields) {
      updates[f.name] = (values[f.name] ?? "").trim() || null;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);
    setLoading(false);
    if (updateError) {
      setError("Could not save. Please try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-800">
          Saved.
        </div>
      )}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="block font-semibold mb-1">{f.label}</label>
          {f.type === "textarea" ? (
            <textarea
              rows={3}
              value={values[f.name] ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.name]: e.target.value }));
                setSaved(false);
              }}
              className="w-full p-2.5 rounded-lg border border-slate-300"
            />
          ) : (
            <input
              type={f.type}
              value={values[f.name] ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.name]: e.target.value }));
                setSaved(false);
              }}
              className="w-full p-2.5 rounded-lg border border-slate-300"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold px-4 py-2.5 rounded-xl transition"
      >
        {loading ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
