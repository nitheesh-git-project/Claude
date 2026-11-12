import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_PAGE_MAX,
  isNotebookRole,
  notebookPagePreview,
  orderNotebookPages,
  parseNotebookPageInput,
} from "./notebook";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("the notebook", () => {
  it("is for the three dashboards, not the back office", () => {
    expect(["patient", "therapist", "hospital"].every(isNotebookRole)).toBe(true);
    expect(isNotebookRole("admin")).toBe(false);
    expect(isNotebookRole(undefined)).toBe(false);
  });

  it("stores a page as a sanitised document, and an empty page as nothing", () => {
    const saved = parseNotebookPageInput(doc("Knee felt better."));
    expect(saved.ok && saved.value).toContain("Knee felt better.");
    expect(parseNotebookPageInput(doc("   "))).toEqual({ ok: true, value: null });
    expect(parseNotebookPageInput(null)).toEqual({ ok: true, value: null });
    expect(parseNotebookPageInput("typed text").ok).toBe(false);
  });

  it("keeps a table, and drops what the editor never offers", () => {
    const saved = parseNotebookPageInput({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://x.test/a.png" } },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "4 of 10" }] }] }],
            },
          ],
        },
      ],
    });
    if (!saved.ok || !saved.value) throw new Error("expected a stored page");
    expect(saved.value).toContain('"table"');
    expect(saved.value).not.toContain("image");
  });

  it("tells the person to start a new page when one is full", () => {
    const full = parseNotebookPageInput(doc("x".repeat(NOTEBOOK_PAGE_MAX)));
    expect(full).toEqual({ ok: false, error: "This page is full. Start a new page to keep writing." });
  });

  it("previews the first words, on one line", () => {
    const stored = parseNotebookPageInput({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Before my next session" }] },
        { type: "paragraph", content: [{ type: "text", text: "Ask about walking." }] },
      ],
    });
    if (!stored.ok) throw new Error(stored.error);
    expect(notebookPagePreview(stored.value)).toBe("Before my next session Ask about walking.");
    expect(notebookPagePreview(stored.value, 12)).toBe("Before my n…");
    expect(notebookPagePreview(null)).toBe("");
  });

  it("numbers pages oldest first, whatever order they arrive in", () => {
    const pages = [
      { id: "b", created_at: "2026-11-10T10:00:00Z" },
      { id: "c", created_at: "2026-11-09T10:00:00Z" },
      { id: "a", created_at: "2026-11-10T10:00:00Z" },
    ];
    expect(orderNotebookPages(pages).map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(pages[0].id).toBe("b");
  });
});
