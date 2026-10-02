import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COUNTER_RETRY_ATTEMPTS, decrementUsedCounter } from "@/lib/purchaseCounter";

/**
 * A fake purchases table whose counter another writer moves `interfere`
 * times between this caller's read and its write -- the race that used to
 * lose a credit.
 */
function fakeAdmin(start: number, interfere: number) {
  const state = { used: start, interfere };
  const client = {
    from() {
      let mode: "select" | "update" = "select";
      let next = 0;
      let expected: number | null = null;
      const q = {
        select() {
          return q;
        },
        update(values: Record<string, number>) {
          mode = "update";
          next = Object.values(values)[0];
          return q;
        },
        eq(column: string, value: unknown) {
          if (column !== "id") expected = value as number;
          return q;
        },
        async maybeSingle() {
          if (mode === "select") {
            const row = { sessions_used: state.used };
            if (state.interfere > 0) {
              state.interfere -= 1;
              state.used += 1; // someone booked between our read and write
            }
            return { data: row, error: null };
          }
          if (expected === state.used) {
            state.used = next;
            return { data: { id: "p" }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, state };
}

describe("decrementUsedCounter", () => {
  it("gives one credit back", async () => {
    const { client, state } = fakeAdmin(3, 0);
    const out = await decrementUsedCounter(client, "patient_package_purchases", "sessions_used", "p");
    expect(out).toEqual({ ok: true, value: 2 });
    expect(state.used).toBe(2);
  });

  it("keeps trying when another writer wins the race, instead of losing the credit", async () => {
    const { client, state } = fakeAdmin(3, 2);
    const out = await decrementUsedCounter(client, "patient_package_purchases", "sessions_used", "p");
    expect(out.ok).toBe(true);
    // Two concurrent bookings moved it to 5; this caller's restore still lands.
    expect(state.used).toBe(4);
  });

  it("reports failure rather than success when it never lands", async () => {
    const { client } = fakeAdmin(3, COUNTER_RETRY_ATTEMPTS + 1);
    const out = await decrementUsedCounter(client, "patient_package_purchases", "sessions_used", "p");
    expect(out.ok).toBe(false);
  });

  it("does nothing to a counter already at zero", async () => {
    const { client, state } = fakeAdmin(0, 0);
    const out = await decrementUsedCounter(client, "patient_package_purchases", "sessions_used", "p");
    expect(out).toMatchObject({ ok: true, alreadyZero: true });
    expect(state.used).toBe(0);
  });
});
