import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The module reads its caps from the environment at import time, so each
// behaviour gets a fresh import with the environment it needs.
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const mod = await import("./resilientFetch");
  return mod;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SUPABASE_MAX_IN_FLIGHT;
  delete process.env.SUPABASE_REQUEST_TIMEOUT_MS;
});

function connectTimeout() {
  const e = new Error("fetch failed") as Error & { cause?: { code: string } };
  e.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return e;
}

describe("resilientSupabaseFetch", () => {
  beforeEach(() => vi.useRealTimers());

  it("never has more requests in flight than the cap", async () => {
    const { resilientSupabaseFetch, supabaseFetchPressure } = await load({
      SUPABASE_MAX_IN_FLIGHT: "3",
    });
    let concurrent = 0;
    let peak = 0;
    globalThis.fetch = (async () => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return new Response("{}");
    }) as typeof fetch;

    await Promise.all(
      Array.from({ length: 20 }, () => resilientSupabaseFetch("https://example.test/x"))
    );
    expect(peak).toBeLessThanOrEqual(3);
    // Everything released -- a leaked slot would wedge the whole process.
    expect(supabaseFetchPressure().inFlight).toBe(0);
    expect(supabaseFetchPressure().queued).toBe(0);
  });

  it("releases its slot when the request throws", async () => {
    const { resilientSupabaseFetch, supabaseFetchPressure } = await load({
      SUPABASE_MAX_IN_FLIGHT: "2",
    });
    globalThis.fetch = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    await Promise.allSettled(
      Array.from({ length: 5 }, () => resilientSupabaseFetch("https://example.test/x"))
    );
    expect(supabaseFetchPressure().inFlight).toBe(0);
  });

  it("retries a GET once on a transport error", async () => {
    const { resilientSupabaseFetch } = await load();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw connectTimeout();
      return new Response("ok");
    }) as typeof fetch;

    const res = await resilientSupabaseFetch("https://example.test/x");
    expect(await res.text()).toBe("ok");
    expect(calls).toBe(2);
  });

  it("never retries a write, because a lost answer is not a lost write", async () => {
    const { resilientSupabaseFetch } = await load();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw connectTimeout();
    }) as typeof fetch;

    await expect(
      resilientSupabaseFetch("https://example.test/rpc/record_payment_capture", {
        method: "POST",
      })
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("does not retry an HTTP error status -- that is an answer, not a lost packet", async () => {
    const { resilientSupabaseFetch } = await load();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("nope", { status: 500 });
    }) as typeof fetch;

    const res = await resilientSupabaseFetch("https://example.test/x");
    expect(res.status).toBe(500);
    expect(calls).toBe(1);
  });

  it("gives up on a request that never answers, rather than holding its slot", async () => {
    const { resilientSupabaseFetch } = await load({
      SUPABASE_REQUEST_TIMEOUT_MS: "40",
      SUPABASE_MAX_IN_FLIGHT: "1",
    });
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      })) as typeof fetch;

    await expect(resilientSupabaseFetch("https://example.test/x")).rejects.toThrow();
  });
});
