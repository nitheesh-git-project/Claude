// QA-only: a localhost passthrough to Supabase.
//
// The browser in this sandbox has no outbound network, but Node does. The
// login page is the one screen that must be driven through the real form
// (everything else can inject a session cookie), and that form calls
// Supabase from the browser. Pointing NEXT_PUBLIC_SUPABASE_URL at this
// relay lets those calls travel Node's route instead. Nothing is mocked --
// every request and response is forwarded verbatim.
import http from "node:http";

const TARGET = process.env.RELAY_TARGET;
const PORT = Number(process.env.RELAY_PORT ?? 8099);

http
  .createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const headers = { ...req.headers };
    delete headers.host;
    delete headers["accept-encoding"];
    delete headers.connection;

    try {
      const upstream = await fetch(`${TARGET}${req.url}`, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : body,
        redirect: "manual",
      });
      const out = Buffer.from(await upstream.arrayBuffer());
      const outHeaders = {};
      upstream.headers.forEach((v, k) => {
        if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) {
          outHeaders[k] = v;
        }
      });
      // The page's origin is the app, not Supabase, so the browser needs to
      // be told the relay is fair game.
      outHeaders["access-control-allow-origin"] = req.headers.origin ?? "*";
      outHeaders["access-control-allow-credentials"] = "true";
      outHeaders["access-control-allow-headers"] = "*";
      outHeaders["access-control-allow-methods"] = "*";
      res.writeHead(req.method === "OPTIONS" ? 204 : upstream.status, outHeaders);
      res.end(req.method === "OPTIONS" ? undefined : out);
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  })
  .listen(PORT, () => console.log(`relay ${PORT} -> ${TARGET}`));
