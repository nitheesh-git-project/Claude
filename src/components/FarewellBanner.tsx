"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function FarewellBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Read straight from the URL on first render instead of via an effect +
  // setState — avoids the extra cascading render, and this only ever needs
  // to reflect whatever query param the page loaded with.
  const [visible] = useState(() => searchParams.get("farewell") === "1");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (searchParams.get("farewell") === "1") {
      const params = new URLSearchParams(searchParams);
      params.delete("farewell");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div className="bg-teal-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 text-xs">
        <span>
          <i className="fa-solid fa-heart mr-1.5"></i>
          Sad to see you go! You&apos;ve been signed out — we hope to see you back
          soon.
        </span>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-white/80 hover:text-white shrink-0"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
}
