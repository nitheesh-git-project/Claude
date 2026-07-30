"use client";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        // A hard navigation (not router.push) so the browser sends a fresh
        // request that's guaranteed to carry the now-cleared auth cookies —
        // a client-side soft nav can race the cookie write and briefly show
        // stale logged-in state.
        window.location.href = "/?farewell=1";
      }}
      className="text-xs font-semibold text-slate-500 hover:text-red-600 transition flex items-center gap-1.5"
    >
      <i className="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
    </button>
  );
}
