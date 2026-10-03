// A stand-in for Supabase, used only by .github/workflows/ci.yml.
//
// `next build` prerenders public pages (the home page, /_not-found), and those
// read Supabase while rendering. CI has no database and must not be given
// one, so the build points at this server instead: every request is answered
// at once with an empty result, which every page already handles as "nothing
// configured yet". It listens on loopback only and holds no data.
import http from "node:http";

const port = Number(process.argv[2] ?? 54321);
http
  .createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[]");
  })
  .listen(port, "127.0.0.1", () => console.log(`stub supabase on ${port}`));
