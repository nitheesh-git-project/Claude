import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor } from "./helpers";

/**
 * "Live updates paused" clears when Refresh reconnects. Refresh used to
 * re-read the page only, so the data came back but the dropped socket did
 * not and the banner stayed until a browser reload. The socket is refused
 * here, then let through, and Refresh must bring the screen back to live.
 */
test("RT-001 the paused banner's Refresh reconnects and clears it", async ({ page, context }) => {
  test.setTimeout(180_000);
  // Supabase's realtime server is stood in for here: a sandbox's egress
  // often cannot carry the websocket at all, and the case under test is a
  // socket that fails and then recovers. While `refuse` holds, the
  // connection is closed; after, channel joins are answered the way the
  // server answers them (Phoenix, protocol 2.0.0: [join_ref, ref, topic,
  // event, payload]), echoing each channel's own bindings back with ids.
  let refuse = true;
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    if (refuse) {
      ws.close({ code: 1011, reason: "e2e: refused" });
      return;
    }
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return;
      let msg: unknown;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      const [joinRef, ref, topic, event, payload] = msg as [
        string | null,
        string | null,
        string,
        string,
        { config?: { postgres_changes?: Record<string, unknown>[] } },
      ];
      const reply = (response: unknown) =>
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "phx_join") {
        const bindings = payload?.config?.postgres_changes ?? [];
        reply({ postgres_changes: bindings.map((b, i) => ({ ...b, id: i + 1 })) });
      } else {
        reply({});
      }
    });
  });
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: "domcontentloaded" });

  const banner = page.getByRole("status").filter({ hasText: "Live updates paused" });
  await expect(banner).toBeVisible({ timeout: 90_000 });

  refuse = false;
  await expect(banner).toHaveCount(1);
  await banner.getByRole("button", { name: /Refresh/ }).click();
  await expect(banner).toHaveCount(0, { timeout: 60_000 });
});
