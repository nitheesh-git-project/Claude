import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joinRealtimeChannel, REALTIME_AUTH_WAIT_MS } from "./realtimeJoin";

// A stand-in for the three calls the helper makes. `log` is the order things
// happened in, which is the whole point of the module.
function fakeClient() {
  const log: string[] = [];
  let resolveAuth: () => void = () => {};
  let rejectAuth: (e: Error) => void = () => {};
  const statusCallbacks: ((status: string) => void)[] = [];
  const client = {
    realtime: {
      setAuth: () => {
        log.push("setAuth");
        return new Promise<void>((resolve, reject) => {
          resolveAuth = () => {
            log.push("token");
            resolve();
          };
          rejectAuth = reject;
        });
      },
    },
    channel: (topic: string) => {
      log.push(`channel ${topic}`);
      return {
        topic,
        subscribe: (callback?: (status: string) => void) => {
          log.push("subscribe");
          if (callback) statusCallbacks.push(callback);
        },
      };
    },
    removeChannel: (channel: { topic: string }) => {
      log.push(`remove ${channel.topic}`);
    },
  };
  return {
    client,
    log,
    resolveAuth: () => resolveAuth(),
    rejectAuth: (e: Error) => rejectAuth(e),
    report: (status: string) => statusCallbacks.forEach((cb) => cb(status)),
  };
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

describe("joinRealtimeChannel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not make or join the channel until the token has settled", async () => {
    const f = fakeClient();
    joinRealtimeChannel(f.client, "t", () => f.log.push("configure"));
    await flush();
    expect(f.log).toEqual(["setAuth"]);

    f.resolveAuth();
    await flush();
    // The token, THEN the join: the order that carries it to the server.
    expect(f.log).toEqual(["setAuth", "token", "channel t", "configure", "subscribe"]);
  });

  it("a cleanup before the token arrives leaves no channel behind", async () => {
    const f = fakeClient();
    const cleanup = joinRealtimeChannel(f.client, "t", () => f.log.push("configure"));
    cleanup();
    f.resolveAuth();
    await flush();
    vi.advanceTimersByTime(REALTIME_AUTH_WAIT_MS * 2);
    expect(f.log).toEqual(["setAuth", "token"]);
  });

  it("a cleanup after the join removes the channel, and later statuses are not reported", async () => {
    const f = fakeClient();
    const statuses: string[] = [];
    const cleanup = joinRealtimeChannel(f.client, "t", () => {}, (s) => statuses.push(s));
    f.resolveAuth();
    await flush();
    f.report("SUBSCRIBED");
    cleanup();
    // Removing a channel reports CLOSED; that is the screen leaving, not a fault.
    f.report("CLOSED");
    expect(statuses).toEqual(["SUBSCRIBED"]);
    expect(f.log.at(-1)).toBe("remove t");
  });

  it("joins anyway when the session cannot be read", async () => {
    const f = fakeClient();
    joinRealtimeChannel(f.client, "t", () => {});
    f.rejectAuth(new Error("no session"));
    await flush();
    expect(f.log).toEqual(["setAuth", "channel t", "subscribe"]);
  });

  it("joins anyway when the session never answers, and only once if it answers late", async () => {
    const f = fakeClient();
    joinRealtimeChannel(f.client, "t", () => {});
    vi.advanceTimersByTime(REALTIME_AUTH_WAIT_MS);
    expect(f.log).toEqual(["setAuth", "channel t", "subscribe"]);

    f.resolveAuth();
    await flush();
    expect(f.log.filter((l) => l === "subscribe")).toHaveLength(1);
  });

  it("joins anyway when asking for the token throws", async () => {
    const f = fakeClient();
    const client = { ...f.client, realtime: { setAuth: () => { throw new Error("boom"); } } };
    joinRealtimeChannel(client, "t", () => {});
    await flush();
    expect(f.log).toEqual(["channel t", "subscribe"]);
  });
});
