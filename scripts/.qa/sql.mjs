// Runs one statement through the Supabase Management API, the same path
// scripts/run-schema.mjs uses. QA-only: used to drop a column/table and put
// it back, to prove the dashboard degrades locally rather than globally.
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: process.argv[2] }),
});
const text = await res.text();
console.log(res.status, text.slice(0, 300));
if (!res.ok) process.exit(1);
