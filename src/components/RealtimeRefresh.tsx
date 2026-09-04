"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/lib/useRouter";
import { createClient } from "@/lib/supabase/client";

// Keeps an already-open dashboard in sync with other users' actions (a
// therapist requesting a payout, a hospital submitting a referral, a new
// therapist signing up) without a manual reload -- subscribes to Postgres
// changes on the given tables via the browser's own authenticated client, so
// RLS applies exactly as it would to any other read by this user (admin sees
// everything via the *_select_admin policies in schema.sql; patient/
// therapist/hospital only see events for their own rows via their existing
// *_select_own policies).
//
// Requires the target tables to be added to the `supabase_realtime`
// publication (see schema.sql) -- without that, Supabase never emits
// postgres_changes events at all, and this silently does nothing (no error,
// just no live updates), same graceful-degradation posture as this
// codebase's migration-dependent queries elsewhere.
// scripts/check-realtime-coverage.mjs fails the lint on that mismatch.
//
// Leading edge, then a cooldown -- deliberately not a plain trailing
// debounce. A refresh is expensive (router.refresh() re-runs the whole
// Server Component; on the admin dashboard that is ~41 queries across every
// screen, not just the visible one), so a burst -- one booking writing
// several rows, or an admin bulk action -- must not cost one refresh per
// row. But a trailing debounce pays for that by delaying *every* update,
// including a lone event with no burst behind it, which is the common case
// and the one an admin is actually watching for.
//
// So: refresh immediately on the first event, then absorb anything that
// arrives during the cooldown and fire exactly one more refresh at the end
// of it if something did. A single change appears at once; a burst still
// collapses to two refreshes at most.
const DEFAULT_COOLDOWN_MS = 2000;

export default function RealtimeRefresh({
  tables,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}: {
  tables: string[];
  // Worth tuning per caller: the cooldown never delays the first change, it
  // only decides how tightly a burst behind it is collapsed. Somewhere the
  // data changes rarely and no one is watching for it (catalog, settings), a
  // long cooldown costs nothing.
  cooldownMs?: number;
}) {
  const router = useRouter();
  const tablesKey = tables.join(",");
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const list = tablesKey.split(",").filter(Boolean);
    if (list.length === 0) return;

    const supabase = createClient();
    const channel = supabase.channel(`realtime-refresh:${tablesKey}`);

    const handleChange = () => {
      // Already waiting to fire at the end of the current cooldown -- this
      // event is part of the burst that trailing refresh will cover.
      if (trailingRef.current) return;

      const sinceLast = Date.now() - lastRefreshRef.current;
      if (sinceLast >= cooldownMs) {
        lastRefreshRef.current = Date.now();
        router.refresh();
        return;
      }

      trailingRef.current = setTimeout(() => {
        trailingRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, cooldownMs - sinceLast);
    };

    for (const table of list) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, handleChange);
    }

    channel.subscribe();

    return () => {
      if (trailingRef.current) clearTimeout(trailingRef.current);
      trailingRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [tablesKey, cooldownMs, router]);

  return null;
}
