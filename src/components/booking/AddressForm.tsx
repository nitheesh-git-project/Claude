"use client";

import type { HomeVisitAddressForm } from "@/lib/homeVisitPayment";

function inputCls() {
  return "w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
}

/**
 * The address fields for a home visit, plus a placeholder where the map pin
 * will go.
 *
 * The map is deliberately not built yet: it needs Maps JavaScript + Places
 * enabled on the Google Cloud project and a referrer-restricted
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, which is a separate piece of setup. The
 * schema already carries latitude, longitude and map_place_id on both
 * patient_addresses and appointments, and every route already accepts and
 * stores them -- they simply stay null until the picker lands. Dropping a
 * <AddressMapPicker> in below is therefore a component swap: no migration,
 * no route change, no change to this component's own contract.
 *
 * Until then the typed fields ARE the address, which is why `landmark` sits
 * directly under the street lines rather than hidden in an optional group:
 * without a pin, the landmark is the main thing that gets a therapist to
 * the right gate.
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

      {/* Placeholder for the Google Maps pin picker. See this file's header
          comment: the fields above already carry everything a booking needs,
          so this is additive precision rather than a missing requirement. */}
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
        <i className="fa-solid fa-map-location-dot text-2xl text-slate-300" />
        <p className="mt-2 text-xs font-semibold text-slate-600">
          Map pin coming soon
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Soon you&apos;ll be able to drop a pin on the exact spot. For now, the
          landmark above is what your therapist will navigate by — please make
          it as specific as you can.
        </p>
      </div>

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
