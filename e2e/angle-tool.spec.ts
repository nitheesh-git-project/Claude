// "Measure from an image" in Record a test (goniometry): the clinician loads a
// screenshot of a video call, taps the landmarks, and the angle is worked out
// in the browser. Written, not run in the build that added it: it needs a
// Supabase project the destructive-tooling rules allow. Own fixture patient
// (an orthopaedic profile and one completed session with QA Therapist A); the
// one write is an append-only measurement, so disposable projects only.
//
// What is asserted: the privacy line, that three taps give the geometry's own
// number, that a drag, the arrow keys, Undo and Start again behave, that "Use
// this angle" fills the reading and marks it an estimate over video, that NO
// request carries the picture (the picture is generated in the page, so any
// upload would show as an image-typed or large body), and that a stored
// estimate is labelled on the measures table and refused by the route when it
// claims to be in person.
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, createFixtureAccount, deleteFixtureAccount, insertPastFixtureAppointment, profileIdFor } from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes an append-only measurement; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
let patient: { id: string; email: string; name: string } | undefined;

// A stick-figure leg on a plain wall, 1200 x 900. Hip, knee, ankle in picture pixels.
const HIP: [number, number] = [300, 300];
const KNEE: [number, number] = [700, 320];
const ANKLE: [number, number] = [560, 700];
const EXPECTED = (() => {
  const a = [HIP[0] - KNEE[0], HIP[1] - KNEE[1]];
  const b = [ANKLE[0] - KNEE[0], ANKLE[1] - KNEE[1]];
  const drawn = (Math.acos((a[0] * b[0] + a[1] * b[1]) / Math.hypot(a[0], a[1]) / Math.hypot(b[0], b[1])) * 180) / Math.PI;
  return Math.round(180 - drawn);
})();

async function samplePng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 900;
    const x = c.getContext("2d")!;
    x.fillStyle = "#d9e2ec";
    x.fillRect(0, 0, 1200, 900);
    x.lineCap = "round";
    x.strokeStyle = "#1f3a5f";
    x.lineWidth = 46;
    x.beginPath();
    x.moveTo(300, 300);
    x.lineTo(700, 320);
    x.lineTo(560, 700);
    x.stroke();
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

async function openTool(page: Page) {
  await page.goto(`${BASE}/therapist/dashboard/health-profile/${patient!.id}`);
  await page.getByRole("button", { name: "Record a test" }).click(SEEN);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Which test/i).selectOption({ label: (await dialog.getByLabel(/Which test/i).locator("option").allTextContents()).find((o) => /Goniometry/.test(o))! });
  await dialog.getByLabel("Which movement?").selectOption("knee_flexion");
  await dialog.getByLabel("Active").check();
  await dialog.getByLabel("Left").check();
  await dialog.getByTestId("measure-from-image").click();
  return dialog;
}

async function tapPoints(page: Page) {
  const box = (await page.getByTestId("angle-stage").boundingBox())!;
  const s = Math.min(box.width / 1200, box.height / 900);
  const ox = box.x + (box.width - 1200 * s) / 2;
  const oy = box.y + (box.height - 900 * s) / 2;
  for (const [x, y] of [HIP, KNEE, ANKLE]) {
    await page.mouse.click(ox + x * s, oy + y * s);
  }
}

test.beforeAll(async () => {
  const therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  patient = await createFixtureAccount("Angle Tool");
  const { error } = await db.from("patient_condition_profiles").insert({
    patient_id: patient.id,
    specialty: "ortho",
    status: "active",
    data: { chief_complaint: "Left knee stiffness, E2E angle tool" },
  });
  expect(error, error?.message).toBeNull();
  await insertPastFixtureAppointment(db, {
    patient_id: patient.id,
    therapist_id: therapistAId,
    status: "completed",
    payment_status: "paid",
    visit_mode: "online",
    duration_minutes: 30,
    concern: "E2E angle tool",
  });
});

test.afterAll(async () => {
  await deleteFixtureAccount(patient?.id);
});

test("AT-001: three taps give the angle, the picture goes nowhere, and Use fills the reading as an estimate over video", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  const page = await context.newPage();
  const requests: { method: string; url: string; type: string; bytes: number }[] = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url(), type: r.headers()["content-type"] ?? "", bytes: (r.postData() ?? "").length }));

  const dialog = await openTool(page);
  const tool = page.getByTestId("angle-tool");
  await expect(tool.getByTestId("angle-privacy")).toContainText("The photo stays on this device and is not saved.");
  await expect(tool.getByText(/hold still for 2 seconds/i)).toBeVisible();
  await expect(tool.getByText(/not equal to a goniometer/i)).toBeAttached();

  const png = await samplePng(page);
  const before = requests.length;
  await tool.getByTestId("angle-file").setInputFiles({ name: "leg.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("angle-stage")).toBeVisible(SEEN);
  await tapPoints(page);

  const readout = tool.getByTestId("angle-value");
  await expect(readout).toBeVisible();
  const shown = Number((await readout.innerText()).replace(/[^\d-]/g, ""));
  // Taps land within a pixel or two of the landmarks: the geometry's own number, give or take 3.
  expect(Math.abs(shown - EXPECTED)).toBeLessThanOrEqual(3);
  await expect(tool.getByTestId("angle-text")).toContainText("estimated from a photo");

  // Nothing carrying the picture left the browser: no body over a few KB, no image or form upload.
  const after = requests.slice(before);
  for (const r of after) {
    expect(r.type, r.url).not.toMatch(/image\/|multipart/i);
    expect(r.bytes, r.url).toBeLessThan(5_000);
    expect(r.url, "no request to another host").toMatch(new RegExp(`^(${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|data:|blob:)`));
  }

  await tool.getByTestId("angle-use").click();
  await expect(tool).toHaveCount(0);
  await expect(dialog.getByLabel(/Reading 1/)).toHaveValue(String(shown));
  await expect(dialog.getByTestId("image-estimate-chip")).toBeVisible();
  await expect(dialog.getByLabel("Over video")).toBeChecked();
  // Saying it was not from a photo clears the mark.
  await dialog.getByRole("button", { name: "It was not from a photo" }).click();
  await expect(dialog.getByTestId("image-estimate-chip")).toHaveCount(0);
  await context.close();
});

test("AT-002: a drag and the arrow keys move a point and the readout follows; Undo and Start again work", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  const page = await context.newPage();
  await openTool(page);
  const tool = page.getByTestId("angle-tool");
  await tool.getByTestId("angle-file").setInputFiles({ name: "leg.png", mimeType: "image/png", buffer: await samplePng(page) });
  await expect(page.getByTestId("angle-stage")).toBeVisible(SEEN);
  await tapPoints(page);
  const readout = tool.getByTestId("angle-value");
  const first = await readout.innerText();

  const handle = tool.getByTestId("angle-point-2");
  const hb = (await handle.boundingBox())!;
  const [sx, sy] = [hb.x + hb.width / 2, hb.y + hb.height / 2];
  expect(hb.width).toBeGreaterThanOrEqual(44);
  expect(hb.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 60, sy - 40, { steps: 6 });
  await page.mouse.up();
  const dragged = await readout.innerText();
  expect(dragged).not.toBe(first);

  await tool.getByTestId("angle-point-1").focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
  expect(await readout.innerText()).not.toBe(dragged);

  await tool.getByRole("button", { name: "Undo" }).click();
  await tool.getByRole("button", { name: "Start again" }).click();
  await expect(readout).toHaveText(/[–-]/);
  await expect(tool.getByTestId("angle-point-0")).toHaveCount(0);
  await context.close();
});

test("AT-003: a stored estimate is labelled on the measures table, and the route refuses one that claims to be in person", async ({ request, browser }) => {
  const post = async (r: APIRequestContext, conditions: Record<string, unknown>, value: number, ago: number) =>
    r.post(`${BASE}/api/therapist/measurements/submit`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.therapistA), "content-type": "application/json" },
      data: {
        patientId: patient!.id,
        measurement: {
          measureKey: "joint_range",
          variant: "knee_flexion_passive",
          side: "left",
          value,
          items: [value, value],
          measuredAt: new Date(Date.now() - ago * 60_000).toISOString(),
          conditions,
        },
      },
    });
  const refused = await post(request, { setting: "in_person", estimatedFromImage: true }, 100, 40);
  expect(refused.status()).toBe(400);
  expect((await post(request, { setting: "in_person" }, 90, 60 * 24 * 10)).status()).toBe(200);
  expect((await post(request, { setting: "video", estimatedFromImage: true }, 104, 30)).status()).toBe(200);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  const page = await context.newPage();
  await page.goto(`${BASE}/therapist/dashboard/health-profile/${patient!.id}`);
  const table = page.getByRole("table", { name: /first, latest and goal reading/i });
  await expect(table.getByText("Estimated from a photo").first()).toBeVisible(SEEN);
  await expect(page.getByTestId("image-estimate-note")).toBeVisible();
  await context.close();
});
