"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import PhoneNumberField from "@/components/PhoneNumberField";

type FieldConfig = {
  name: string;
  label: string;
  type: "text" | "phone" | "textarea" | "select";
  options?: string[];
};

export default function InstantProfileFields({
  userId,
  fields,
  currentValues,
}: {
  userId: string;
  fields: FieldConfig[];
  currentValues: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(currentValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const isDirty = fields.some(
    (f) => (values[f.name] ?? "").trim() !== (currentValues[f.name] ?? "").trim()
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isDirty) {
      setEditing(false);
      return;
    }
    setError(null);

    for (const f of fields) {
      const v = (values[f.name] ?? "").trim();
      if (f.type === "phone" && v && !isValidStoredPhone(v)) {
        setError(`Please enter a valid ${f.label.toLowerCase()}, or leave it blank.`);
        return;
      }
    }

    setLoading(true);

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
    setEditing(false);
    router.refresh();
  }

  function handleCancel() {
    setValues(currentValues);
    setError(null);
    setEditing(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
          {error}
        </div>
      )}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="block font-semibold mb-1">{f.label}</label>
          {!editing ? (
            <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
              {currentValues[f.name] || "Not set"}
            </p>
          ) : f.type === "textarea" ? (
            <textarea
              rows={3}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="w-full p-2.5 rounded-lg border border-slate-300"
            />
          ) : f.type === "select" ? (
            <select
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
            >
              <option value="" disabled hidden>
                Select {f.label}
              </option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === "phone" ? (
            <PhoneNumberField
              value={values[f.name] ?? ""}
              onChange={(v) => setValues((vals) => ({ ...vals, [f.name]: v }))}
              label=""
            />
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
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2.5 rounded-xl transition"
        >
          Edit
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-4 py-2.5 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold px-4 py-2.5 rounded-xl transition"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </form>
  );
}
