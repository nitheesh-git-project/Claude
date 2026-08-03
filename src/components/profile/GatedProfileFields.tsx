"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PhoneNumberField from "@/components/PhoneNumberField";

type FieldConfig = {
  name: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "phone";
  options?: string[];
  min?: string | number;
  max?: string | number;
};

export type FieldStatusMap = Record<
  string,
  | { status: "pending"; requestId: string; newValue: unknown }
  | { status: "declined"; notes: string | null }
>;

export default function GatedProfileFields({
  userId,
  fields,
  currentValues,
  fieldStatus,
}: {
  userId: string;
  fields: FieldConfig[];
  currentValues: Record<string, string>;
  fieldStatus: FieldStatusMap;
}) {
  const [values, setValues] = useState<Record<string, string>>(currentValues);
  const [loading, setLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Fields the user has actually edited this session. handleSubmit only
  // ever diffs these against fresh server data — never every editable
  // field — so a stale local draft for an untouched field (e.g. one that
  // got approved elsewhere between this mount and now) can never be
  // silently resubmitted or reverted.
  const touchedRef = useRef<Set<string>>(new Set());

  // currentValues is a new snapshot on every router.refresh() (after our
  // own submit/withdraw, but potentially after any other server refetch
  // too). Resync any field the user hasn't touched to that fresh value —
  // otherwise `values` would keep whatever was there at mount forever,
  // since useState's initializer only runs once.
  useEffect(() => {
    setValues((prev) => {
      const next = { ...currentValues };
      for (const name of touchedRef.current) {
        if (name in prev) next[name] = prev[name];
      }
      return next;
    });
  }, [currentValues]);

  function setField(name: string, value: string) {
    touchedRef.current.add(name);
    setValues((v) => ({ ...v, [name]: value }));
  }

  const editableFields = fields.filter((f) => fieldStatus[f.name]?.status !== "pending");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setJustSubmitted(false);

    // Each changed field becomes its own request row (rather than one row
    // holding every change) so it can later be withdrawn or reviewed on
    // its own — a single shared row would mean withdrawing any one field
    // deletes the whole row and silently withdraws the others with it.
    const rows: { user_id: string; changes: Record<string, string | number | null> }[] = [];
    for (const f of editableFields) {
      if (!touchedRef.current.has(f.name)) continue;
      const rawNew = (values[f.name] ?? "").trim();
      const rawOld = (currentValues[f.name] ?? "").trim();
      if (rawNew === rawOld) continue;

      let value: string | number | null;
      if (f.type === "number") {
        const n = rawNew === "" ? null : Number(rawNew);
        value = n === null || Number.isNaN(n) ? null : n;
      } else {
        value = rawNew === "" ? null : rawNew;
      }
      rows.push({ user_id: userId, changes: { [f.name]: value } });
    }

    if (rows.length === 0) {
      setError("You haven't changed anything yet.");
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase.from("profile_change_requests").insert(rows);
    setLoading(false);

    if (insertError) {
      setError("Could not submit your request. Please try again.");
      return;
    }
    touchedRef.current.clear();
    setJustSubmitted(true);
    router.refresh();
  }

  async function handleWithdraw(requestId: string) {
    setWithdrawingId(requestId);
    setError(null);
    const { error: deleteError } = await supabase
      .from("profile_change_requests")
      .delete()
      .eq("id", requestId);
    setWithdrawingId(null);
    if (deleteError) {
      setError("Could not withdraw the request. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
          {error}
        </div>
      )}
      {justSubmitted && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-800">
          Your request has been submitted for admin review.
        </div>
      )}
      {fields.map((f) => {
        const status = fieldStatus[f.name];
        const isLocked = status?.status === "pending";
        return (
          <div key={f.name}>
            <label className="flex items-center gap-2 font-semibold mb-1">
              {f.label}
              {isLocked && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  Pending Review
                </span>
              )}
            </label>

            {isLocked ? (
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-slate-700 font-semibold">
                  {status.newValue === null || status.newValue === undefined || status.newValue === ""
                    ? "—"
                    : String(status.newValue)}
                </span>
                <button
                  type="button"
                  onClick={() => handleWithdraw(status.requestId)}
                  disabled={withdrawingId === status.requestId}
                  className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60 shrink-0"
                >
                  {withdrawingId === status.requestId ? "Withdrawing..." : "Withdraw"}
                </button>
              </div>
            ) : f.type === "select" ? (
              <select
                value={values[f.name] ?? ""}
                onChange={(e) => setField(f.name, e.target.value)}
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
                onChange={(v) => setField(f.name, v)}
                label=""
              />
            ) : (
              <input
                type={f.type}
                value={values[f.name] ?? ""}
                min={f.min}
                max={f.max}
                onChange={(e) => setField(f.name, e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300"
              />
            )}

            {status?.status === "declined" && status.notes && (
              <p className="text-red-600 mt-1">
                <span className="font-semibold">Last request declined:</span> {status.notes}
              </p>
            )}
          </div>
        );
      })}
      {editableFields.length > 0 && (
        <>
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
        </>
      )}
    </form>
  );
}
