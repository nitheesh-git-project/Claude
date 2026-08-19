"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Keeps an already-open dashboard in sync with other users' actions (a
// therapist requesting a payout, a hospital submitting a referral, a new
// therapist signing up) without a manual reload -- subscribes to Postgres
// changes on the given tables via the browser's own authenticated client, so
// RLS applies exactly as it would to any other read by this user (admin sees
// everything via the *_select_admin policies in schema.sql; patient/
// therapist/hospital only see events for their own rows via their existing
// *_select_own policies). A burst of changes (e.g. an admin bulk action)
// collapses into a single router.refresh() via the trailing debounce rather
// than one refresh per row.
//
// Requires the target tables to be added to the `supabase_realtime`
// publication (see schema.sql) -- without that, Supabase never emits
// postgres_changes events at all, and this silently does nothing (no error,
// just no live updates), same graceful-degradation posture as this
// codebase's migration-dependent queries elsewhere.
//
// debounceMs is worth tuning per caller rather than leaving at the default.
// A refresh is not free: router.refresh() re-runs the whole Server
// Component, and on the admin dashboard that is ~41 queries for every
// screen at once (see AdminShell). Somewhere the underlying data changes
// rarely (catalog, settings) or the viewer is not watching a live queue, a
// longer window collapses far more events into one refresh and nobody
// notices the delay.
export default function RealtimeRefresh({
  tables,
  debounceMs = 400,
}: {
  tables: string[];
  debounceMs?: number;
}) {
  const router = useRouter();
  const tablesKey = tables.join(",");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const list = tablesKey.split(",").filter(Boolean);
    if (list.length === 0) return;

    const supabase = createClient();
    const channel = supabase.channel(`realtime-refresh:${tablesKey}`);

    for (const table of list) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => router.refresh(), debounceMs);
        }
      );
    }

    channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, debounceMs, router]);

  return null;
}
