"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript, parsePlaceResult, type ParsedPlace } from "@/lib/googleMaps";

// Geographic center of India at a country-wide zoom -- used only until a
// pin exists. The service area is a pincode allowlist, not a fixed city, so
// there's no single "home base" to center on instead.
const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };
const INDIA_ZOOM = 5;
const PIN_ZOOM = 16;

type LoadState = "loading" | "ready" | "unavailable";

/**
 * Places Autocomplete search box + a draggable pin on an embedded map, for
 * the two places this app collects a home-visit address
 * (booking/AddressForm.tsx, profile/MyAddresses.tsx). The typed address
 * fields around this component remain fully authoritative and submittable
 * on their own -- this is additive precision, not a requirement, so every
 * failure mode below degrades to "just don't show the map" rather than
 * blocking the form.
 *
 * Uses the classic google.maps.places.Autocomplete + google.maps.Marker,
 * not the newer PlaceAutocompleteElement/AdvancedMarkerElement web
 * components -- those are harder to style to match this app's plain
 * <input> look, and AdvancedMarkerElement additionally needs a separate
 * Cloud Console "Map ID" most setups won't have.
 *
 * Dragging the pin clears mapPlaceId (a manually placed point is no longer
 * the autocomplete-resolved place, and keeping the stale id would be
 * misleading downstream). Reverse geocoding the dragged position back into
 * an address is a deliberate non-goal here -- it would need the Geocoding
 * API enabled and adds latency to every drag for a nice-to-have.
 */
export default function AddressMapPicker({
  latitude,
  longitude,
  onPinChange,
  onPlaceSelect,
  initialQuery,
  disabled = false,
}: {
  latitude: number | null;
  longitude: number | null;
  onPinChange: (lat: number, lng: number, placeId: string | null) => void;
  onPlaceSelect?: (place: ParsedPlace) => void;
  initialQuery?: string;
  disabled?: boolean;
}) {
  // Whether a key is configured is known synchronously (inlined at build
  // time), so the initial state already reflects it instead of starting at
  // "idle" and setState-ing to "loading" as the effect's first act.
  const hasApiKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [loadState, setLoadState] = useState<LoadState>(hasApiKey ? "loading" : "unavailable");
  const inputRef = useRef<HTMLInputElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  // Latest callbacks in a ref so the one-time setup effect below doesn't
  // need them in its dependency array and re-run (which would tear down
  // and rebuild the map/listeners on every parent re-render). Refs are only
  // written inside effects, never during render.
  const onPinChangeRef = useRef(onPinChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => {
    onPinChangeRef.current = onPinChange;
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPinChange, onPlaceSelect]);

  useEffect(() => {
    if (!hasApiKey) return;
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !mapDivRef.current || !inputRef.current) return;

        const hasPin = latitude != null && longitude != null;
        const center = hasPin ? { lat: latitude, lng: longitude } : INDIA_CENTER;
        const map = new google.maps.Map(mapDivRef.current, {
          center,
          zoom: hasPin ? PIN_ZOOM : INDIA_ZOOM,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        const marker = new google.maps.Marker({
          map,
          position: hasPin ? center : null,
          draggable: !disabled,
        });
        mapRef.current = map;
        markerRef.current = marker;

        marker.addListener("dragend", () => {
          const position = marker.getPosition();
          if (position) onPinChangeRef.current(position.lat(), position.lng(), null);
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (disabled || !e.latLng) return;
          marker.setPosition(e.latLng);
          onPinChangeRef.current(e.latLng.lat(), e.latLng.lng(), null);
        });

        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "in" },
          fields: ["address_components", "geometry", "name", "place_id"],
        });
        autocompleteRef.current = autocomplete;
        autocomplete.addListener("place_changed", () => {
          const parsed = parsePlaceResult(autocomplete.getPlace());
          if (!parsed) return;
          const position = { lat: parsed.latitude, lng: parsed.longitude };
          marker.setPosition(position);
          map.setCenter(position);
          map.setZoom(PIN_ZOOM);
          onPinChangeRef.current(parsed.latitude, parsed.longitude, parsed.placeId);
          onPlaceSelectRef.current?.(parsed);
        });

        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("unavailable");
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      if (markerRef.current) {
        google.maps.event.clearInstanceListeners(markerRef.current);
      }
      if (mapRef.current) {
        google.maps.event.clearInstanceListeners(mapRef.current);
      }
    };
    // Intentionally empty: this sets up the map/marker/autocomplete once
    // per mount. latitude/longitude/disabled changes are handled by the
    // sync effects below instead of tearing down and rebuilding Maps
    // objects on every keystroke elsewhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An external reset (e.g. MyAddresses' "Cancel") should move the pin
  // back without waiting for a remount.
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    if (latitude == null || longitude == null) {
      markerRef.current.setPosition(null);
      return;
    }
    const position = { lat: latitude, lng: longitude };
    markerRef.current.setPosition(position);
    mapRef.current.setCenter(position);
  }, [latitude, longitude]);

  useEffect(() => {
    markerRef.current?.setDraggable(!disabled);
  }, [disabled]);

  if (!hasApiKey) return null;

  if (loadState === "unavailable") {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
        <i className="fa-solid fa-map-location-dot text-2xl text-slate-300" />
        <p className="mt-2 text-xs font-semibold text-slate-600">Map unavailable right now</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          The fields above are all we need — please make your landmark as specific as you can.
        </p>
      </div>
    );
  }

  // The input/map div render from "loading" onward (not only once
  // "ready") so their refs already exist in the DOM by the time the setup
  // effect's promise resolves and needs mapDivRef.current/inputRef.current.
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="text"
        defaultValue={initialQuery}
        disabled={disabled || loadState === "loading"}
        placeholder="Search for the address"
        className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50"
      />
      <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-200">
        <div ref={mapDivRef} className="h-full w-full" />
        {loadState === "loading" && (
          <div className="absolute inset-0 animate-pulse bg-slate-100" />
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Search or drag the pin to the exact spot — this is optional, the fields above are enough
        on their own.
      </p>
    </div>
  );
}
