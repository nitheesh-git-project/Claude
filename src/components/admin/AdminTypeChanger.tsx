"use client";

import { useId, useState } from "react";
import { useConfirm } from "@/lib/useConfirm";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";

/**
 * "Change" beside a value a Master Admin may set directly on a People
 * profile: a therapist's specialisation, or a patient's condition type. A
 * picker and Save, asking first (it changes who a therapist is matched with,
 * or which Health Profile a patient sees), then the route, then a refresh.
 * Rendered only for a full-scope viewer -- the routes refuse anyone else.
 */
export default function AdminTypeChanger({
  endpoint,
  idField,
  id,
  current,
  options,
  noun,
  confirmLine,
}: {
  endpoint: string;
  idField: "therapistId" | "patientId";
  id: string;
  current: string | null;
  options: { value: string; label: string }[];
  /** "specialisation" or "condition type" */
  noun: string;
  /** What changing it does, for the confirmation. */
  confirmLine: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { confirm, dialog } = useConfirm();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value || value === current) {
      setOpen(false);
      return;
    }
    const label = options.find((o) => o.value === value)?.label ?? value;
    const ok = await confirm(`Change the ${noun} to ${label}? ${confirmLine}`, {
      confirmLabel: "Change it",
      cancelLabel: "Keep as it is",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [idField]: id, specialty: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save. Please try again.");
        return;
      }
      show(`The ${noun} is now ${label}`);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-2 font-semibold text-teal-700 hover:underline"
        data-testid={`change-${idField === "therapistId" ? "specialty" : "condition-type"}`}
      >
        Change
      </button>
    );
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2" data-testid="type-changer">
      <label htmlFor={selectId} className="sr-only">
        New {noun}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white p-1.5 text-xs"
      >
        {!current && <option value="">Choose…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-xs font-semibold text-slate-600">
        Cancel
      </button>
      {error && (
        <span role="alert" className="w-full text-red-600">
          {error}
        </span>
      )}
      {dialog}
    </span>
  );
}
