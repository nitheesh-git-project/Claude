"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhoneNumberField from "@/components/PhoneNumberField";

export default function TherapistContactEditForm({
  therapistId,
  currentPhone,
  currentEmail,
}: {
  therapistId: string;
  currentPhone: string | null;
  currentEmail: string;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [email, setEmail] = useState(currentEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/update-therapist-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, phone, email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="text-xs space-y-1">
        <p>
          <span className="text-slate-400">Email:</span>{" "}
          <span className="font-semibold text-slate-800">{currentEmail}</span>
        </p>
        <p>
          <span className="text-slate-400">Phone:</span>{" "}
          <span className="font-semibold text-slate-800">
            {currentPhone || "Not set"}
          </span>
        </p>
        <button
          onClick={() => {
            setPhone(currentPhone ?? "");
            setEmail(currentEmail);
            setError(null);
            setEditing(true);
          }}
          className="text-teal-700 font-semibold hover:underline"
        >
          Edit Contact Info
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <label className="block font-semibold mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
        <p className="text-[10px] text-slate-400 mt-1">
          Changing this also changes their sign-in email.
        </p>
      </div>
      <PhoneNumberField value={phone} onChange={setPhone} label="Phone" />
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(false)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
