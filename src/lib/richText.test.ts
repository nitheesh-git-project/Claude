import { describe, it, expect } from "vitest";
import {
  isRichTextEmpty,
  parseRichText,
  parseRichTextInput,
  plainTextToRichDoc,
  RICH_TABLE_MAX_COLUMNS,
  RICH_TABLE_MAX_ROWS,
  RICH_TEXT_MAX_STORED_LENGTH,
  richTextToPlain,
  safeHref,
  sanitizeRichDoc,
  serializeRichText,
  type RichDoc,
} from "./richText";

describe("plain text written before the editor", () => {
  it("keeps paragraphs and single line breaks", () => {
    const doc = plainTextToRichDoc("First line\nsecond line\n\nNew paragraph");
    expect(doc.content).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "First line" },
          { type: "hardBreak" },
          { type: "text", text: "second line" },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "New paragraph" }] },
    ]);
  });

  it("reads Windows line endings the same way", () => {
    expect(plainTextToRichDoc("a\r\n\r\nb").content).toHaveLength(2);
  });

  it("parses a legacy value, and one that only looks like JSON, as text", () => {
    expect(richTextToPlain(parseRichText("Hello\nthere"))).toBe("Hello\nthere");
    expect(richTextToPlain(parseRichText("{not json} at all"))).toBe("{not json} at all");
  });

  it("reads null, empty and whitespace as an empty document", () => {
    for (const v of [null, undefined, "", "   \n  "]) {
      expect(isRichTextEmpty(parseRichText(v))).toBe(true);
    }
  });
});

describe("a stored document", () => {
  const doc: RichDoc = {
    type: "doc",
    content: [
      { type: "heading", level: 2, content: [{ type: "text", text: "About" }] },
      {
        type: "paragraph",
        align: "center",
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "link", marks: [{ type: "link", href: "https://example.com" }] },
        ],
      },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }],
      },
      {
        type: "orderedList",
        start: 3,
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "three" }] }] }],
      },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quote" }] }] },
    ],
  };

  it("round-trips through storage unchanged", () => {
    const stored = serializeRichText(doc)!;
    expect(parseRichText(stored)).toEqual(doc);
  });

  it("reads the editor's own attribute shape (textAlign, level, href)", () => {
    const fromEditor = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3, textAlign: "right" }, content: [{ type: "text", text: "H" }] },
        {
          type: "paragraph",
          attrs: { textAlign: "left" },
          content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "mailto:a@b.c", target: "_blank" } }] }],
        },
      ],
    };
    expect(sanitizeRichDoc(fromEditor).content).toEqual([
      { type: "heading", level: 3, align: "right", content: [{ type: "text", text: "H" }] },
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", href: "mailto:a@b.c" }] }] },
    ]);
  });
});

describe("the allow-list", () => {
  it("drops unknown nodes, marks and attributes", () => {
    const hostile = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
        { type: "codeBlock", content: [{ type: "text", text: "code" }] },
        {
          type: "paragraph",
          attrs: { style: "color:red", textAlign: "justify" },
          content: [
            { type: "text", text: "hi", marks: [{ type: "textStyle", attrs: { color: "red" } }, { type: "bold" }, { type: "bold" }] },
            { type: "mention", attrs: { id: "x" } },
          ],
        },
      ],
    };
    expect(sanitizeRichDoc(hostile).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }] },
    ]);
  });

  it("keeps the words of a link whose target is unsafe", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "/admin/dashboard", "https://a b.com", "  "]) {
      const doc = sanitizeRichDoc({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "t", marks: [{ type: "link", attrs: { href } }] }] }],
      });
      expect(doc.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "t" }] });
    }
  });

  it("accepts http(s), mailto and tel targets", () => {
    expect(safeHref("https://x.org/a?b=1")).toBe("https://x.org/a?b=1");
    expect(safeHref("HTTP://x.org")).toBe("HTTP://x.org");
    expect(safeHref("tel:+919999999999")).toBe("tel:+919999999999");
    expect(safeHref(42)).toBeNull();
  });

  it("maps a level-1 heading below the page title and stops runaway nesting", () => {
    expect(
      sanitizeRichDoc({ type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [] }] }).content[0]
    ).toMatchObject({ type: "heading", level: 2 });

    let deep: unknown = { type: "paragraph", content: [{ type: "text", text: "deep" }] };
    for (let i = 0; i < 20; i++) deep = { type: "blockquote", content: [deep] };
    expect(richTextToPlain(sanitizeRichDoc({ type: "doc", content: [deep] }))).toBe("");
  });

  it("rejects something that is not a document", () => {
    expect(sanitizeRichDoc("<b>hi</b>").content).toEqual([]);
    expect(sanitizeRichDoc(null).content).toEqual([]);
  });
});

describe("serializeRichText", () => {
  it("stores nothing for a document with nothing to read", () => {
    expect(
      serializeRichText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "hardBreak" }] }] })
    ).toBeNull();
  });
});

describe("parseRichTextInput", () => {
  it("stores a sanitised document, and null for empty or cleared", () => {
    const ok = parseRichTextInput({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] });
    expect(ok.ok && JSON.parse(ok.value!).content[0].content[0].text).toBe("Hi");
    expect(parseRichTextInput(null)).toEqual({ ok: true, value: null });
    expect(parseRichTextInput({ type: "doc", content: [] })).toEqual({ ok: true, value: null });
  });

  it("refuses something that is not a document, and a document that is too long", () => {
    expect(parseRichTextInput("plain string").ok).toBe(false);
    const long = "x".repeat(RICH_TEXT_MAX_STORED_LENGTH);
    expect(parseRichTextInput({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: long }] }] }).ok).toBe(false);
  });
});

describe("the editor's scaffolding", () => {
  it("drops empty paragraphs at the start and end, keeps ones in the middle", () => {
    const empty = { type: "paragraph", content: [] };
    const text = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
    const doc = sanitizeRichDoc({ type: "doc", content: [empty, text("a"), empty, text("b"), empty, empty] });
    expect(doc.content.map((b) => (b.type === "paragraph" ? b.content.length : -1))).toEqual([1, 0, 1]);
  });
});

describe("tables (opt-in)", () => {
  const cell = (type: "tableCell" | "tableHeader", text: string) => ({
    type,
    attrs: { colspan: 2, rowspan: 1, colwidth: [120] },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const table = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          { type: "tableRow", content: [cell("tableHeader", "Day"), cell("tableHeader", "Video")] },
          { type: "tableRow", content: [cell("tableCell", "Friday")] },
        ],
      },
    ],
  };

  it("drops a table unless the caller allows them", () => {
    expect(sanitizeRichDoc(table).content).toEqual([]);
    expect(sanitizeRichDoc(table, { tables: true }).content).toHaveLength(1);
  });

  it("keeps a plain grid: spans and widths dropped, short rows padded", () => {
    const [block] = sanitizeRichDoc(table, { tables: true }).content;
    if (block.type !== "table") throw new Error("expected a table");
    expect(block.rows.map((r) => r.cells.length)).toEqual([2, 2]);
    expect(block.rows[0].cells.map((c) => c.header)).toEqual([true, true]);
    expect(block.rows[1].cells[1]).toEqual({ header: false, content: [{ type: "paragraph", content: [] }] });
    expect(JSON.stringify(block)).not.toContain("colspan");
  });

  it("never nests a table in a cell, and caps rows and columns", () => {
    const nested = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [{ type: "tableCell", content: [table.content[0], { type: "paragraph", content: [{ type: "text", text: "in" }] }] }],
            },
          ],
        },
      ],
    };
    const [block] = sanitizeRichDoc(nested, { tables: true }).content;
    if (block.type !== "table") throw new Error("expected a table");
    expect(block.rows[0].cells[0].content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "in" }] }]);

    const wide = {
      type: "doc",
      content: [
        {
          type: "table",
          content: Array.from({ length: 50 }, () => ({
            type: "tableRow",
            content: Array.from({ length: 20 }, () => cell("tableCell", "x")),
          })),
        },
      ],
    };
    const [big] = sanitizeRichDoc(wide, { tables: true }).content;
    if (big.type !== "table") throw new Error("expected a table");
    expect(big.rows).toHaveLength(RICH_TABLE_MAX_ROWS);
    expect(big.rows[0].cells).toHaveLength(RICH_TABLE_MAX_COLUMNS);
  });

  it("round-trips through storage, and reads as text", () => {
    const stored = serializeRichText(sanitizeRichDoc(table, { tables: true }));
    expect(stored).toContain('"tableHeader"');
    const again = parseRichText(stored, { tables: true });
    expect(again).toEqual(sanitizeRichDoc(table, { tables: true }));
    expect(richTextToPlain(again)).toBe("Day\tVideo\nFriday");
    // The same stored value, read by a surface that does not allow tables.
    expect(parseRichText(stored).content).toEqual([]);
  });

  it("parseRichTextInput takes the caller's limit and wording", () => {
    const long = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "y".repeat(500) }] }] };
    expect(parseRichTextInput(long, { maxLength: 100, tooLong: "Too long for this." })).toEqual({
      ok: false,
      error: "Too long for this.",
    });
    expect(parseRichTextInput(long).ok).toBe(true);
  });
});
