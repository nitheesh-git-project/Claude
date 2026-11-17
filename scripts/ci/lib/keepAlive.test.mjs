import { describe, it, expect } from "vitest";
import http from "node:http";
import { applyKeepAlive, GATE_KEEP_ALIVE_MS } from "./keepAlive.mjs";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

/** GET twice on one pooled agent, `gapMs` apart; reports whether the second reused the socket. */
function reusedAfter(port, gapMs) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const get = () =>
    new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, agent }, (res) => {
        res.resume();
        res.on("end", () => resolve(req.reusedSocket));
      });
      req.on("error", reject);
    });
  return get()
    .then(() => new Promise((r) => setTimeout(r, gapMs)))
    .then(get)
    .finally(() => agent.destroy());
}

describe("applyKeepAlive", () => {
  it("raises the idle timeout of a new server, and leaves one that chose its own value", async () => {
    const undo = applyKeepAlive(http);
    try {
      const plain = http.createServer();
      await listen(plain);
      expect(plain.keepAliveTimeout).toBe(GATE_KEEP_ALIVE_MS);
      expect(plain.headersTimeout).toBeGreaterThan(plain.keepAliveTimeout);
      plain.close();

      const chosen = http.createServer();
      chosen.keepAliveTimeout = 9_000;
      await listen(chosen);
      expect(chosen.keepAliveTimeout).toBe(9_000);
      chosen.close();
    } finally {
      undo();
    }
  });

  it("is undone completely", async () => {
    const own = Object.prototype.hasOwnProperty.call(http.Server.prototype, "listen");
    applyKeepAlive(http)();
    expect(Object.prototype.hasOwnProperty.call(http.Server.prototype, "listen")).toBe(own);
    const server = http.createServer();
    await listen(server);
    expect(server.keepAliveTimeout).toBe(5_000);
    server.close();
  });

  it("keeps a pooled connection open past 6 s, where an untouched server has closed it", async () => {
    // The untouched server is started before the patch goes on: the setting is
    // applied when a server starts listening.
    const control = http.createServer((req, res) => res.end("ok"));
    const controlPort = await listen(control);
    const undo = applyKeepAlive(http);
    let patched;
    try {
      patched = http.createServer((req, res) => res.end("ok"));
      const patchedPort = await listen(patched);
      const [controlReused, patchedReused] = await Promise.all([
        reusedAfter(controlPort, 7_000),
        reusedAfter(patchedPort, 7_000),
      ]);
      expect(controlReused).toBe(false); // closed at 5 s plus the 1 s Node adds: the second request had to reconnect
      expect(patchedReused).toBe(true); // still open: nothing to race
    } finally {
      undo();
      control.close();
      patched?.close();
      control.closeAllConnections?.();
      patched?.closeAllConnections?.();
    }
  }, 25_000);
});
