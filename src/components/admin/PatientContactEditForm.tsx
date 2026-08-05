"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PhoneNumberField from "@/components/PhoneNumberField";

export default function PatientContactEditForm({
  patientId,
  currentPhone,
  currentEmail,
}: {
  patientId: string;
  currentPhone: string | null;
  currentEmail: string;
}) {
  // Prop-derived base: reverts to the real prop on failure (no refresh
  // happens), matches the new prop on success once router.refresh() lands.
  const [optimisticContact, setOptimisticContact] = useOptimistic({
    phone: currentPhone,
    email: currentEmail,
  });
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [email, setEmail] = useState(currentEmail);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    const newPhone = phone;
    const newEmail = email;
    startTransition(async () => {
      setOptimisticContact({ phone: newPhone, email: newEmail });
      const res = await fetch("/api/admin/update-patient-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, phone: newPhone, email: newEmail }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="text-xs space-y-1">
        <p>
          <span className="text-slate-400">Email:</span>{" "}
          <span className="font-semibold text-slate-800">{optimisticContact.email}</span>
        </p>
        <p>
          <span className="text-slate-400">Phone:</span>{" "}
          <span className="font-semibold text-slate-800">
            {optimisticContact.phone || "Not set"}
          </span>
        </p>
        <button
          onClick={() => {
            setPhone(optimisticContact.phone ?? "");
            setEmail(optimisticContact.email);
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
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
