import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto("http://localhost:3000/book", { waitUntil: "domcontentloaded" });
const fromBrowser = await page.evaluate(async (u) => {
  try { const r = await fetch(u + "/rest/v1/", { method: "GET" }); return "HTTP " + r.status; }
  catch (e) { return "THREW: " + e.message; }
}, process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("browser -> supabase:", fromBrowser);
const r = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/");
console.log("node    -> supabase: HTTP", r.status);
await browser.close();
