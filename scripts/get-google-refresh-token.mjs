#!/usr/bin/env node
// One-time helper to obtain a Google OAuth2 refresh token for the Calendar
// integration (src/lib/googleCalendar.ts). Run this once, from your own
// machine, after creating a Web-application OAuth2 Client in Google Cloud
// Console and setting the consent screen's Publishing status to
// "In production" (testing-status refresh tokens expire after 7 days).
//
// Setup, before running this script:
//   1. https://console.cloud.google.com -> create/select a project.
//   2. Enable the "Google Calendar API".
//   3. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
//      -> Application type: Web application.
//      -> Authorized redirect URIs: add http://localhost:53682/oauth2callback
//   4. APIs & Services -> OAuth consent screen -> Publishing status:
//      "In production" (not "Testing").
//   5. Sign in to the Gmail account that should organize the sessions, and
//      create a new, separate Calendar (Settings -> Add calendar -> Create
//      new calendar) so sessions don't clutter that account's main calendar.
//      Copy its Calendar ID from that calendar's Settings page.
//   6. Set GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET in
//      .env.local from the OAuth client created in step 3, and
//      GOOGLE_CALENDAR_ID from step 5.
//
// Usage:
//   node scripts/get-google-refresh-token.mjs
// It opens a local HTTP server, prints an auth URL for you to open in a
// browser, and once you approve access, prints the refresh token to save as
// GOOGLE_CALENDAR_REFRESH_TOKEN in .env.local.

import { google } from "googleapis";
import http from "node:http";
import { readFileSync } from "node:fs";

const REDIRECT_URI = "http://localhost:53682/oauth2callback";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // .env.local may not exist yet -- rely on real env vars instead.
  }
}

loadEnvLocal();

const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET.\n" +
      "Set them in .env.local first (see this script's header comment for setup steps)."
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // forces a refresh token even if this account has authorized before
  scope: [SCOPE],
});

console.log("\n1. Open this URL in a browser, signed in as the account that should organize sessions:\n");
console.log(authUrl);
console.log("\n2. Approve access. You'll be redirected back here automatically.\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Missing code");
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" }).end(
      "Success — you can close this tab and check your terminal."
    );
    console.log("\nSave this in .env.local:\n");
    console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    if (!tokens.refresh_token) {
      console.error(
        "No refresh token returned — this Google account likely already granted this app access before.\n" +
          "Revoke prior access at https://myaccount.google.com/permissions and re-run this script."
      );
    }
  } catch (err) {
    console.error("Failed to exchange code for tokens:", err);
    res.writeHead(500).end("Failed — check your terminal.");
  } finally {
    server.close();
  }
});

server.listen(53682);
