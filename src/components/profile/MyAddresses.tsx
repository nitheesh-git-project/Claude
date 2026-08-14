"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/lib/useConfirm";
import { formatAddressBlock } from "@/lib/formatAddress";

export type SavedAddress = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string;
  contact_phone: string | null;
  access_notes: string | null;
  is_default: boolean;
};

function inputCls() {
  return "w-full p-2.5 rounded-lg border border-slate-300 text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
}

function AddressForm({
  address,
  isFirst,
  onDone,
}: {
  address?: SavedAddress;
  isFirst: boolean;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(address?.label ?? "");
  const [line1, setLine1] = useState(address?.line1 ?? "");
  const [line2, setLine2] = useState(address?.line2 ?? "");
  const [landmark, setLandmark] = useState(address?.landmark ?? "");
  const [city, setCity] = useState(address?.city ?? "");
  const [state, setState] = useState(address?.state ?? "");
  const [pincode, setPincode] = useState(address?.pincode ?? "");
  const [contactPhone, setContactPhone] = useState(address?.contact_phone ?? "");
  const [accessNotes, setAccessNotes] = useState(address?.access_notes ?? "");
  // The very first address a patient saves is their default whether they
  // tick the box or not -- a picker with nothing preselected is a worse
  // default than any address.
  const [isDefault, setIsDefault] = useState(address?.is_default ?? isFirst);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/patient/addresses/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: address?.id,
          label: label || null,
          line1,
          line2: line2 || null,
          landmark: landmark || null,
          city: city || null,
          state: state || null,
          pincode,
          contactPhone: contactPhone || null,
          accessNotes: accessNotes || null,
          isDefault: isDefault || isFirst,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        onDone();
      } else {
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputCls()}
            placeholder="Home, Mum's place"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">Pincode</span>
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            inputMode="numeric"
            className={inputCls()}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">
          Flat / house number and street
        </span>
        <input value={line1} onChange={(e) => setLine1(e.target.value)} className={inputCls()} />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">Area / locality</span>
        <input value={line2} onChange={(e) => setLine2(e.target.value)} className={inputCls()} />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">Nearest landmark</span>
        <input
          value={landmark}
          onChange={(e) => setLandmark(e.target.value)}
          className={inputCls()}
        />
        <span className="mt-1 block text-[10px] text-slate-400">
          This is what actually helps your therapist find you.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls()} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">State</span>
          <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls()} />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">
          Phone to call on arrival
        </span>
        <input
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          className={inputCls()}
          placeholder="If different from your account number"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">How to get in</span>
        <textarea
          value={accessNotes}
          onChange={(e) => setAccessNotes(e.target.value)}
          rows={2}
          className={inputCls()}
          placeholder="2nd floor, no lift. Ring twice."
        />
      </label>

      {!isFirst && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span className="text-[11px] text-slate-600">Use this address by default</span>
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          {isPending ? "Saving..." : address ? "Save changes" : "Add address"}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MyAddresses({ addresses }: { addresses: SavedAddress[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleRemove(id: string) {
    if (!(await confirm("Remove this address? Visits already booked to it are unaffected."))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/patient/addresses/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not remove. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-slate-800">My Addresses</h2>
        <p className="mt-1 text-xs text-slate-500">
          Where a therapist comes for a home visit. You can change these any time — no approval
          needed.
        </p>
      </div>

      {addresses.length === 0 && !adding ? (
        <p className="py-4 text-center text-xs text-slate-500">
          No saved addresses yet. You can also add one while booking a home visit.
        </p>
      ) : (
        <ul className="space-y-2">
          {addresses.map((a) =>
            editingId === a.id ? (
              <li key={a.id}>
                <AddressForm address={a} isFirst={false} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {a.label || "Address"}
                    {a.is_default && (
                      <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                        Default
                      </span>
                    )}
                  </p>
                  {formatAddressBlock(a).map((line) => (
                    <p key={line} className="mt-0.5 text-slate-600">
                      {line}
                    </p>
                  ))}
                  {a.access_notes && (
                    <p className="mt-1 text-slate-500">
                      <span className="font-semibold text-slate-400">Getting in:</span>{" "}
                      {a.access_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingId(a.id)}
                    className="text-[11px] font-semibold text-teal-700 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemove(a.id)}
                    disabled={isPending}
                    className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding ? (
        <AddressForm isFirst={addresses.length === 0} onDone={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-900"
        >
          + Add an address
        </button>
      )}
      {dialog}
    </div>
  );
}
