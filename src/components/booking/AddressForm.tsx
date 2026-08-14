"use client";

import type { HomeVisitAddressForm } from "@/lib/homeVisitPayment";
import AddressMapPicker from "@/components/AddressMapPicker";

function inputCls() {
  return "w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
}

/**
 * The address fields for a home visit, plus a map picker for dropping a
 * precise pin.
 *
 * The picker degrades to nothing (see AddressMapPicker) if
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is unset or the script fails to load --
 * the typed fields are always enough on their own to complete a booking.
 * That's why `landmark` sits directly under the street lines rather than
 * hidden in an optional group: with or without a pin, the landmark is what
 * actually gets a therapist to the right gate.
 *
 * Autocomplete selection deliberately does not overwrite `pincode` -- the
 * wizard already collected and serviceability-checked it in an earlier
 * step, and silently replacing it from an autocomplete guess could point a
 * booking at a pincode that was never checked for serviceability.
 */
export default function AddressForm({
  value,
  onChange,
  disabled = false,
}: {
  value: HomeVisitAddressForm;
  onChange: (next: HomeVisitAddressForm) => void;
  disabled?: boolean;
}) {
  function set<K extends keyof HomeVisitAddressForm>(
    key: K,
    v: HomeVisitAddressForm[K]
  ) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-semibold text-slate-700">
          Flat / house number and street
        </span>
        <input
          value={value.line1 ?? ""}
          onChange={(e) => set("line1", e.target.value)}
          disabled={disabled}
          required
          className={inputCls()}
          placeholder="12A, Sunrise Apartments, Beach Road"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">
          Area / locality <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          value={value.line2 ?? ""}
          onChange={(e) => set("line2", e.target.value)}
          disabled={disabled}
          className={inputCls()}
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Nearest landmark</span>
        <input
          value={value.landmark ?? ""}
          onChange={(e) => set("landmark", e.target.value)}
          disabled={disabled}
          className={inputCls()}
          placeholder="Opposite the SBI branch"
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          This is what actually helps your therapist find you.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">City</span>
          <input
            value={value.city ?? ""}
            onChange={(e) => set("city", e.target.value)}
            disabled={disabled}
            className={inputCls()}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">State</span>
          <input
            value={value.state ?? ""}
            onChange={(e) => set("state", e.target.value)}
            disabled={disabled}
            className={inputCls()}
          />
        </label>
      </div>

      <AddressMapPicker
        latitude={value.latitude ?? null}
        longitude={value.longitude ?? null}
        onPinChange={(latitude, longitude, mapPlaceId) =>
          onChange({ ...value, latitude, longitude, mapPlaceId })
        }
        onPlaceSelect={(place) =>
          onChange({
            ...value,
            line1: place.line1 || value.line1,
            city: place.city || value.city,
            state: place.state || value.state,
            latitude: place.latitude,
            longitude: place.longitude,
            mapPlaceId: place.placeId,
          })
        }
        initialQuery={value.line1}
        disabled={disabled}
      />

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">
          Phone to call on arrival{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          value={value.contactPhone ?? ""}
          onChange={(e) => set("contactPhone", e.target.value)}
          disabled={disabled}
          className={inputCls()}
          placeholder="If different from your account number"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">
          How to get in
        </span>
        <textarea
          value={value.accessNotes ?? ""}
          onChange={(e) => set("accessNotes", e.target.value)}
          disabled={disabled}
          rows={3}
          className={inputCls()}
          placeholder="2nd floor, no lift. Ring the bell twice. Friendly dog in the yard."
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          Floor, lift, gate code, parking, pets — anything that saves a phone
          call at your door.
        </span>
      </label>
    </div>
  );
}
