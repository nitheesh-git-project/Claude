// Same imperative script-tag-plus-Promise pattern as loadRazorpayScript in
// razorpay.ts. Memoized so mounting the picker more than once (e.g.
// MyAddresses opening/closing its edit form) never injects the script
// twice. @types/google.maps declares `google.maps.*` as an ambient global
// namespace, so no hand-written `declare global` block is needed here the
// way razorpay.ts needs one for `window.Razorpay`.
let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // No DOM mutation on this path -- the picker treats this as "map
    // simply isn't offered," not a failure to recover from.
    return Promise.reject(new Error("Google Maps is not configured."));
  }
  if (loadPromise) return loadPromise;
  if (typeof google !== "undefined" && google.maps?.places) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Could not load Google Maps."));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

export type ParsedPlace = {
  line1: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
};

// Turns a Places Autocomplete selection into the fields this app's address
// forms actually use. Returns null for a plain text search with no matched
// place (no geometry) -- callers should ignore those rather than drop a pin
// at (0, 0).
export function parsePlaceResult(place: google.maps.places.PlaceResult): ParsedPlace | null {
  const location = place.geometry?.location;
  if (!location) return null;

  const components = place.address_components ?? [];
  function component(type: string): string {
    return components.find((c) => c.types.includes(type))?.long_name ?? "";
  }

  const line1 = [component("street_number"), component("route")].filter(Boolean).join(" ");
  const city = component("locality") || component("administrative_area_level_2");

  return {
    line1: line1 || place.name || "",
    city,
    state: component("administrative_area_level_1"),
    pincode: component("postal_code"),
    latitude: location.lat(),
    longitude: location.lng(),
    placeId: place.place_id ?? null,
  };
}
