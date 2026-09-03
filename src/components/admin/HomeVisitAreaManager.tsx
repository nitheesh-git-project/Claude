"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";

export type ServiceAreaRow = {
  id: string;
  city: string;
  area_name: string | null;
  pincode: string;
  travel_fee_paise: number;
  notes: string | null;
  active: boolean;
  // Whether any visit or saved address already points at this area. Delete
  // is only offered when nothing does -- see the row actions below.
  in_use: boolean;
};

export type WaitlistRow = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  pincode: string;
  city: string | null;
  note: string | null;
  status: string;
  created_at: string;
};

function inputCls() {
  return "w-full p-2 rounded-lg border border-slate-300 text-xs";
}

function BulkAddForm({ onDone }: { onDone: () => void }) {
  const [city, setCity] = useState("");
  const [areaName, setAreaName] = useState("");
  const [pincodesText, setPincodesText] = useState("");
  const [travelFeeInr, setTravelFeeInr] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  // Live preview of what will actually be sent, so a typo is visible before
  // submitting rather than coming back as a server error.
  const parsed = pincodesText
    .split(/[\s,;]+/)
    .map(normalizePincode)
    .filter(Boolean);
  const unique = Array.from(new Set(parsed));
  const invalid = unique.filter((p) => !isValidPincodeShape(p));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/admin/create-home-visit-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city,
        areaName: areaName || null,
        pincodes: pincodesText,
        travelFeeInr,
        notes: notes || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setResult(
        `Added ${data.added} pincode${data.added === 1 ? "" : "s"}${
          data.skipped > 0 ? `, skipped ${data.skipped} already served` : ""
        }.`
      );
      setPincodesText("");
      router.refresh();
      onDone();
    } else {
      setError(data.error ?? "Could not save. Please try again.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} required className={inputCls()} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">Area name (optional)</span>
          <input value={areaName} onChange={(e) => setAreaName(e.target.value)} className={inputCls()} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600">Travel fee (₹ per visit)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={travelFeeInr}
            onChange={(e) => setTravelFeeInr(e.target.value)}
            className={inputCls()}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">Pincodes</span>
        <textarea
          value={pincodesText}
          onChange={(e) => setPincodesText(e.target.value)}
          rows={3}
          required
          className={inputCls()}
          placeholder="600020, 600041, 600096 — paste as many as you like, separated by spaces, commas or new lines"
        />
        <span className="block text-[10px] text-slate-400 mt-1">
          Every pincode here gets the same city and travel fee. Duplicates and ones already served
          are skipped.
        </span>
      </label>

      {unique.length > 0 && (
        <p className="text-[11px] text-slate-600">
          {unique.length} unique pincode{unique.length === 1 ? "" : "s"}
          {parsed.length !== unique.length && (
            <span className="text-slate-400"> ({parsed.length - unique.length} duplicate removed)</span>
          )}
          {invalid.length > 0 && (
            <span className="text-red-600 font-semibold"> · Not valid: {invalid.join(", ")}</span>
          )}
        </p>
      )}

      <label className="block">
        <span className="text-[11px] font-semibold text-slate-600">Notes (optional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls()} />
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {result && <p className="text-xs text-teal-700">{result}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || invalid.length > 0}
          className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition disabled:opacity-60"
        >
          {loading ? "Adding..." : "Add Service Areas"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-slate-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

function AreaRow({ area }: { area: ServiceAreaRow }) {
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState(area.city);
  const [areaName, setAreaName] = useState(area.area_name ?? "");
  const [pincode, setPincode] = useState(area.pincode);
  const [travelFeeInr, setTravelFeeInr] = useState(String(area.travel_fee_paise / 100));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  function post(url: string, body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function handleDelete() {
    if (!(await confirm("Delete this service area? This can't be undone."))) return;
    post("/api/admin/delete-home-visit-area", { id: area.id });
  }

  if (editing) {
    return (
      <li className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
        <div className="grid sm:grid-cols-4 gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls()} placeholder="City" />
          <input
            value={areaName}
            onChange={(e) => setAreaName(e.target.value)}
            className={inputCls()}
            placeholder="Area"
          />
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            className={inputCls()}
            placeholder="Pincode"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={travelFeeInr}
            onChange={(e) => setTravelFeeInr(e.target.value)}
            className={inputCls()}
            placeholder="Travel fee ₹"
          />
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              post("/api/admin/update-home-visit-area", {
                id: area.id,
                city,
                areaName: areaName || null,
                pincode,
                travelFeeInr,
              })
            }
            disabled={isPending}
            className="bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-[11px] text-slate-500 hover:underline">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between flex-wrap gap-2">
      <div>
        <p className="font-semibold text-slate-900">
          <span className="font-mono">{area.pincode}</span> · {area.city}
          {area.area_name && <span className="text-slate-500"> ({area.area_name})</span>}
        </p>
        <p className="text-slate-500 mt-0.5">
          Travel ₹{(area.travel_fee_paise / 100).toLocaleString("en-IN")} per visit
          {area.notes && <span className="text-slate-400"> · {area.notes}</span>}
        </p>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`font-semibold px-2.5 py-1 rounded-full ${
            area.active ? "text-teal-700 bg-teal-50" : "text-slate-500 bg-slate-100"
          }`}
        >
          {area.active ? "Active" : "Off"}
        </span>
        <button onClick={() => setEditing(true)} className="text-[11px] text-teal-700 font-semibold hover:underline">
          Edit
        </button>
        <button
          onClick={() =>
            post("/api/admin/update-home-visit-area", { id: area.id, active: !area.active })
          }
          disabled={isPending}
          className="text-[11px] text-slate-600 font-semibold hover:underline disabled:opacity-60"
        >
          {area.active ? "Deactivate" : "Reactivate"}
        </button>
        {/* Delete only where nothing references the area. Anywhere else,
            deactivating is the correct action -- removing the row would
            strip the fee context off visits already delivered there. */}
        {!area.in_use && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
      {dialog}
    </li>
  );
}

function WaitlistItem({ entry }: { entry: WaitlistRow }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function setStatus(status: string) {
    startTransition(async () => {
      const res = await fetch("/api/admin/update-home-visit-waitlist-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, status }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <li className="p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between flex-wrap gap-2">
      <div>
        <p className="font-semibold text-slate-900">
          <span className="font-mono">{entry.pincode}</span>
          {entry.city && <span className="text-slate-500"> · {entry.city}</span>}
        </p>
        <p className="text-slate-500 mt-0.5">
          {entry.name ?? "No name"} · {entry.phone}
          {entry.email && <span> · {entry.email}</span>}
        </p>
        {entry.note && <p className="text-slate-400 mt-0.5">{entry.note}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          {entry.status}
        </span>
        {(["contacted", "served", "declined"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            disabled={isPending || entry.status === s}
            className="text-[11px] text-teal-700 font-semibold hover:underline disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </li>
  );
}

export default function HomeVisitAreaManager({
  areas,
  waitlist,
}: {
  areas: ServiceAreaRow[];
  waitlist: WaitlistRow[];
}) {
  const [adding, setAdding] = useState(false);
  const pending = waitlist.filter((w) => w.status === "new");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800">Service Areas</h3>
          <p className="text-xs text-slate-500 mt-1">
            The pincodes a therapist will travel to, and what the trip costs. A booking from
            anywhere else is turned away before any payment is taken.
          </p>
        </div>

        {areas.length === 0 && !adding ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No service areas yet — home visits can&apos;t be booked anywhere until you add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {areas.map((area) => (
              <AreaRow key={area.id} area={area} />
            ))}
          </ul>
        )}

        {adding ? (
          <BulkAddForm onDone={() => setAdding(false)} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
          >
            + Add Service Areas
          </button>
        )}
      </div>

      <div className="space-y-3 pt-6 border-t border-slate-200">
        <div>
          <h3 className="font-bold text-sm text-slate-800">
            Out-of-area requests
            {pending.length > 0 && (
              <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {pending.length} new
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            People who tried to book from a pincode we don&apos;t serve. This is the demand signal
            for which area to open next.
          </p>
        </div>

        {waitlist.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {waitlist.map((entry) => (
              <WaitlistItem key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
