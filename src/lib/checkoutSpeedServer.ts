// Reads the last seven days of Pay-tap timings for System Health's
// Checkout speed check. The judgement is in systemHealth.ts; the percentile
// arithmetic is in checkoutTiming.ts; this is only the read.

import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { percentileMs } from "@/lib/checkoutTiming";
import type { CheckoutSpeedHealth } from "@/lib/systemHealth";

const WINDOW_DAYS = 7;
// Plenty for a stable percentile, and a bound on what one dashboard render
// pulls: the most recent taps are the ones that describe the product now.
const MAX_ROWS = 2000;

/** Null when the table could not be read -- "could not check" is not "fast". */
export async function readCheckoutSpeed(
  admin: ReturnType<typeof createAdminClient>,
  nowMs: number
): Promise<CheckoutSpeedHealth | null> {
  const since = new Date(nowMs - WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("checkout_timings")
    .select("total_ms, signup_ms, create_ms, order_ms")
    .eq("outcome", "opened")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) return null;
  const rows = data ?? [];
  const column = (key: "signup_ms" | "create_ms" | "order_ms") =>
    rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  const totals = rows.map((r) => r.total_ms).filter((v): v is number => typeof v === "number");
  return {
    samples: totals.length,
    p50Ms: percentileMs(totals, 50),
    p90Ms: percentileMs(totals, 90),
    stageP50Ms: {
      signup: percentileMs(column("signup_ms"), 50),
      create: percentileMs(column("create_ms"), 50),
      order: percentileMs(column("order_ms"), 50),
    },
  };
}
