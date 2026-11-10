import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLatestWins } from "@/lib/latestWins";

describe("createLatestWins", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends only the newest of a burst", async () => {
    const send = vi.fn(async () => undefined);
    const q = createLatestWins<string>(send, 200);
    q.push("ready");
    q.push("go");
    q.push("done");
    await vi.advanceTimersByTimeAsync(199);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("done");
  });

  it("flush sends at once", async () => {
    const send = vi.fn(async () => undefined);
    const q = createLatestWins<string>(send, 500);
    q.push("go");
    q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith("go");
  });

  it("keeps one request in flight and sends the newest after it", async () => {
    let release: () => void = () => undefined;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const q = createLatestWins<number>(send, 10);
    q.push(1);
    await vi.advanceTimersByTimeAsync(11);
    expect(send).toHaveBeenCalledTimes(1);
    q.push(2);
    q.push(3);
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(3);
  });

  it("survives a failed send and cancel drops what is waiting", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const q = createLatestWins<number>(send, 10);
    q.push(1);
    await vi.advanceTimersByTimeAsync(11);
    q.push(2);
    q.cancel();
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledTimes(1);
    q.push(3);
    await vi.advanceTimersByTimeAsync(11);
    expect(send).toHaveBeenLastCalledWith(3);
  });
});
