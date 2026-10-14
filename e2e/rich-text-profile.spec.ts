// Formatted public copy: the admin's display content and the therapist's own
// bio, both written in the Docs-style editor and shown on /team.
//
// Both used to be printed into a plain <p>, so every Enter collapsed into one
// long line on the live page. Rules: src/lib/richText.ts.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, profileIdFor } from "./helpers";

async function clearAndFocus(page: Page, testId: string) {
  const editor = page.getByTestId(testId);
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  return editor;
}

test.describe("Formatted therapist profile copy", () => {
  test("RT-001: admin display content keeps its formatting in the saved view and on /team", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data: before } = await admin
      .from("profiles")
      .select("full_name, public_display_note, visible_on_team")
      .eq("id", therapistId)
      .single();
    await admin.from("profiles").update({ visible_on_team: true }).eq("id", therapistId);

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);
      const field = page.getByTestId("display-content");
      await expect(field).toBeVisible({ timeout: 60_000 });
      await field.getByRole("button", { name: /^(Edit|Add)$/ }).click();

      await clearAndFocus(page, "display-content-editor");
      const toolbar = page.getByRole("toolbar", { name: /Public display content formatting/ });
      await toolbar.getByRole("button", { name: "Bold" }).click();
      await page.keyboard.type("Back pain specialist");
      await toolbar.getByRole("button", { name: "Bold" }).click();
      await page.keyboard.type(" with ten years in clinic.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Second paragraph.");
      await page.keyboard.press("Enter");
      await toolbar.getByRole("button", { name: "Bulleted list" }).click();
      await page.keyboard.type("Posture");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Sports injuries");

      // Cancel with unsaved changes asks first, and "Keep editing" keeps it.
      await field.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Keep editing" }).click();
      await expect(page.getByTestId("display-content-editor")).toBeVisible();

      await field.getByRole("button", { name: "Save" }).click();

      const saved = page.getByTestId("display-content-saved");
      await expect(saved).toBeVisible({ timeout: 30_000 });
      await expect(saved.locator("strong")).toHaveText("Back pain specialist");
      await expect(saved.locator(":scope > p")).toHaveCount(2);
      await expect(saved.locator("li")).toHaveText(["Posture", "Sports injuries"]);
      await expect(field.getByRole("button", { name: "Edit" })).toBeVisible();

      const { data: row } = await admin
        .from("profiles")
        .select("public_display_note")
        .eq("id", therapistId)
        .single();
      expect(JSON.parse(row!.public_display_note!).type).toBe("doc");

      // The public popup renders the same structure.
      const visitor = await browser.newContext();
      const pub = await visitor.newPage();
      await pub.goto(`${BASE}/team`);
      await pub.getByRole("button", { name: new RegExp(before!.full_name!) }).first().click();
      const note = pub.getByTestId("team-display-note");
      await expect(note).toBeVisible({ timeout: 30_000 });
      await expect(note.locator("strong")).toHaveText("Back pain specialist");
      await expect(note.locator(":scope > p")).toHaveCount(2);
      await expect(note.locator("li")).toHaveCount(2);
      await visitor.close();
    } finally {
      await context.close();
      await admin
        .from("profiles")
        .update({
          public_display_note: before?.public_display_note ?? null,
          visible_on_team: before?.visible_on_team ?? true,
        })
        .eq("id", therapistId);
    }
  });

  test("RT-002: a therapist's bio saves its paragraphs and shows them read-only with Edit", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data: before } = await admin.from("profiles").select("bio").eq("id", therapistId).single();

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/therapist/dashboard/profile`);
      const field = page.getByTestId("therapist-bio");
      await expect(field).toBeVisible({ timeout: 60_000 });
      await field.getByRole("button", { name: /^(Edit|Add)$/ }).click();
      await clearAndFocus(page, "therapist-bio-editor");
      await page.keyboard.type("Works with desk-based patients.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Video and home visits.");
      await field.getByRole("button", { name: "Save" }).click();

      const saved = page.getByTestId("therapist-bio-saved");
      await expect(saved.locator("p")).toHaveText(["Works with desk-based patients.", "Video and home visits."], {
        timeout: 30_000,
      });
      await page.reload();
      await expect(page.getByTestId("therapist-bio-saved").locator("p")).toHaveCount(2, { timeout: 60_000 });
    } finally {
      await context.close();
      await admin.from("profiles").update({ bio: before?.bio ?? null }).eq("id", therapistId);
    }
  });

  test("RT-003: the routes refuse a body that is not an editor document", async () => {
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const res = await fetch(`${BASE}/api/admin/update-therapist-display-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
      body: JSON.stringify({ therapistId, content: "<script>alert(1)</script>" }),
    });
    expect(res.status).toBe(400);
    const anon = await fetch(`${BASE}/api/therapist/update-bio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { type: "doc", content: [] } }),
    });
    expect(anon.status).toBe(403);
  });
});
