"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
      }}
      className="text-xs font-semibold text-slate-500 hover:text-red-600 transition flex items-center gap-1.5"
    >
      <i className="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
    </button>
  );
}
