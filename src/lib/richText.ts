/**
 * Formatted text a person writes for the public site: a therapist's bio and
 * the admin's display content on their /team popup.
 *
 * Both used to be plain text printed into a `<p>`, so every Enter was
 * collapsed into one long line on the live page while the admin's own
 * preview (which kept the line breaks) looked fine. They are now written in
 * a Docs-style editor (`RichTextEditor`, Tiptap) and stored as that editor's
 * JSON document in the same text columns.
 *
 * This module is the one judgement about that JSON, and it is deliberately
 * the only thing that decides what reaches a page:
 *
 * 1. **It is an allow-list.** A stored document is rebuilt node by node from
 *    the kinds below; anything else -- an unknown node, an unknown mark, an
 *    attribute nobody asked for -- is dropped, never passed through. The bio
 *    is written by the therapist's own session, so the column cannot be
 *    trusted to hold what the editor produced.
 * 2. **Nothing becomes HTML.** `RichTextView` turns the sanitised tree into
 *    React elements, so there is no `dangerouslySetInnerHTML` anywhere and no
 *    markup to escape. A link keeps only an http(s), mailto or tel target.
 * 3. **Old rows still read.** A value that is not a stored document is the
 *    plain text written before this existed; it becomes paragraphs (a blank
 *    line) and line breaks (a single Enter), which is what the author meant.
 *
 * The formatting set is brand-safe by decision: bold, italic, underline,
 * strikethrough, two heading levels, bullet and numbered lists, quotes,
 * links and alignment. No colours, fonts or sizes -- the public page keeps
 * its own typography.
 *
 * Dependency-free and unit-tested, like every other judgement in `src/lib`.
 */

export type RichMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "link"; href: string };

export type RichAlign = "left" | "center" | "right";

export type RichInline =
  | { type: "text"; text: string; marks?: RichMark[] }
  | { type: "hardBreak" };

export type RichBlock =
  | { type: "paragraph"; align?: RichAlign; content: RichInline[] }
  | { type: "heading"; level: 2 | 3; align?: RichAlign; content: RichInline[] }
  | { type: "bulletList"; content: RichListItem[] }
  | { type: "orderedList"; start?: number; content: RichListItem[] }
  | { type: "blockquote"; content: RichBlock[] };

export type RichListItem = { type: "listItem"; content: RichBlock[] };

export type RichDoc = { type: "doc"; content: RichBlock[] };

/** Stored size ceiling, in characters of the stored JSON. A /team popup is
 *  read on a phone; this is far beyond any sensible bio and exists so a
 *  pasted document cannot fill the column. */
export const RICH_TEXT_MAX_STORED_LENGTH = 20_000;

const MAX_DEPTH = 6;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Only targets a visitor can safely follow. Anything else -- javascript:,
 *  data:, a relative path that could be mistaken for ours -- loses the link
 *  and keeps the words. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  if (!href || href.length > 2000) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
    // A URL with whitespace or a control character in it is not one.
    if (/\s/.test(href) || [...href].some((c) => c.charCodeAt(0) < 0x20)) return null;
    return href;
  }
  return null;
}

function sanitizeAlign(attrs: Record<string, unknown> | null): RichAlign | undefined {
  const align = attrs?.textAlign;
  return align === "center" || align === "right" ? align : undefined;
}

function sanitizeMarks(raw: unknown): RichMark[] | undefined {
  const marks: RichMark[] = [];
  const seen = new Set<string>();
  for (const m of asArray(raw)) {
    const mark = asRecord(m);
    const type = mark?.type;
    if (typeof type !== "string" || seen.has(type)) continue;
    if (type === "bold" || type === "italic" || type === "underline" || type === "strike") {
      marks.push({ type });
      seen.add(type);
    } else if (type === "link") {
      const href = safeHref(asRecord(mark?.attrs)?.href);
      if (href) {
        marks.push({ type: "link", href });
        seen.add(type);
      }
    }
  }
  return marks.length ? marks : undefined;
}

function sanitizeInline(raw: unknown): RichInline[] {
  const out: RichInline[] = [];
  for (const n of asArray(raw)) {
    const node = asRecord(n);
    if (!node) continue;
    if (node.type === "text" && typeof node.text === "string" && node.text.length > 0) {
      const marks = sanitizeMarks(node.marks);
      out.push(marks ? { type: "text", text: node.text, marks } : { type: "text", text: node.text });
    } else if (node.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    }
  }
  return out;
}

function sanitizeListItems(raw: unknown, depth: number): RichListItem[] {
  const items: RichListItem[] = [];
  for (const n of asArray(raw)) {
    const node = asRecord(n);
    if (node?.type !== "listItem") continue;
    const content = sanitizeBlocks(node.content, depth + 1);
    items.push({
      type: "listItem",
      content: content.length ? content : [{ type: "paragraph", content: [] }],
    });
  }
  return items;
}

function sanitizeBlocks(raw: unknown, depth: number): RichBlock[] {
  if (depth > MAX_DEPTH) return [];
  const out: RichBlock[] = [];
  for (const n of asArray(raw)) {
    const node = asRecord(n);
    if (!node) continue;
    const attrs = asRecord(node.attrs);
    switch (node.type) {
      case "paragraph": {
        const align = sanitizeAlign(attrs);
        out.push({ type: "paragraph", ...(align ? { align } : {}), content: sanitizeInline(node.content) });
        break;
      }
      case "heading": {
        // Level 1 is the page's own title; anything the editor offers maps
        // to the two levels below it.
        const level = attrs?.level === 3 ? 3 : 2;
        const align = sanitizeAlign(attrs);
        out.push({ type: "heading", level, ...(align ? { align } : {}), content: sanitizeInline(node.content) });
        break;
      }
      case "bulletList": {
        const items = sanitizeListItems(node.content, depth);
        if (items.length) out.push({ type: "bulletList", content: items });
        break;
      }
      case "orderedList": {
        const items = sanitizeListItems(node.content, depth);
        const start = typeof attrs?.start === "number" && Number.isInteger(attrs.start) && attrs.start > 1 && attrs.start < 10_000
          ? attrs.start
          : undefined;
        if (items.length) out.push({ type: "orderedList", ...(start ? { start } : {}), content: items });
        break;
      }
      case "blockquote": {
        const content = sanitizeBlocks(node.content, depth + 1);
        if (content.length) out.push({ type: "blockquote", content });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function isEmptyParagraph(block: RichBlock): boolean {
  return (
    block.type === "paragraph" &&
    block.content.every((n) => n.type === "hardBreak" || n.text.trim() === "")
  );
}

/** Empty paragraphs at the very start or end are the editor's scaffolding
 *  (it keeps one after a list so the cursor can leave it), not something the
 *  author wrote -- on the page they would be a blank gap. Ones in the middle
 *  are deliberate spacing and stay. */
function trimEmptyEdges(blocks: RichBlock[]): RichBlock[] {
  let start = 0;
  let end = blocks.length;
  while (start < end && isEmptyParagraph(blocks[start])) start++;
  while (end > start && isEmptyParagraph(blocks[end - 1])) end--;
  return blocks.slice(start, end);
}

/** Plain text written before the editor existed: a blank line is a new
 *  paragraph, a single Enter is a line break. */
export function plainTextToRichDoc(text: string): RichDoc {
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return { type: "doc", content: [] };
  const paragraphs = normalised.split(/\n{2,}/);
  return {
    type: "doc",
    content: paragraphs.map((para) => {
      const lines = para.split("\n");
      const content: RichInline[] = [];
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    }),
  };
}

function looksLikeStoredDoc(value: string): boolean {
  return value.trimStart().startsWith("{") && value.includes('"type"');
}

/** Whatever is in the column -- a stored document, old plain text, or
 *  nothing -- as a sanitised document. Never throws. */
export function parseRichText(stored: string | null | undefined): RichDoc {
  if (!stored) return { type: "doc", content: [] };
  if (looksLikeStoredDoc(stored)) {
    try {
      const parsed = asRecord(JSON.parse(stored));
      if (parsed?.type === "doc") {
        return { type: "doc", content: trimEmptyEdges(sanitizeBlocks(parsed.content, 0)) };
      }
    } catch {
      // Not JSON after all: somebody's bio that happens to start with "{".
    }
  }
  return plainTextToRichDoc(stored);
}

/** Sanitises an editor document (from a request body) for storage. */
export function sanitizeRichDoc(raw: unknown): RichDoc {
  const doc = asRecord(raw);
  if (doc?.type !== "doc") return { type: "doc", content: [] };
  return { type: "doc", content: trimEmptyEdges(sanitizeBlocks(doc.content, 0)) };
}

function inlineText(content: RichInline[]): string {
  return content.map((n) => (n.type === "text" ? n.text : "\n")).join("");
}

function blockText(block: RichBlock): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return inlineText(block.content);
    case "bulletList":
    case "orderedList":
      return block.content.map((item) => item.content.map(blockText).join("\n")).join("\n");
    case "blockquote":
      return block.content.map(blockText).join("\n");
  }
}

/** The words alone, for a length count or a search. */
export function richTextToPlain(doc: RichDoc): string {
  return doc.content.map(blockText).join("\n\n").trim();
}

/** True when there is nothing a reader would see -- empty paragraphs and
 *  stray breaks count as nothing. */
export function isRichTextEmpty(doc: RichDoc): boolean {
  return richTextToPlain(doc).trim() === "";
}

type EditorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

function inlineToEditor(content: RichInline[]): EditorNode[] {
  return content.map((n) =>
    n.type === "hardBreak"
      ? { type: "hardBreak" }
      : {
          type: "text",
          text: n.text,
          ...(n.marks
            ? {
                marks: n.marks.map((m) =>
                  m.type === "link" ? { type: "link", attrs: { href: m.href } } : { type: m.type }
                ),
              }
            : {}),
        }
  );
}

function blockToEditor(block: RichBlock): EditorNode {
  switch (block.type) {
    case "paragraph":
      return {
        type: "paragraph",
        ...(block.align ? { attrs: { textAlign: block.align } } : {}),
        content: inlineToEditor(block.content),
      };
    case "heading":
      return {
        type: "heading",
        attrs: { level: block.level, ...(block.align ? { textAlign: block.align } : {}) },
        content: inlineToEditor(block.content),
      };
    case "bulletList":
      return { type: "bulletList", content: block.content.map(listItemToEditor) };
    case "orderedList":
      return {
        type: "orderedList",
        ...(block.start ? { attrs: { start: block.start } } : {}),
        content: block.content.map(listItemToEditor),
      };
    case "blockquote":
      return { type: "blockquote", content: block.content.map(blockToEditor) };
  }
}

function listItemToEditor(item: RichListItem): EditorNode {
  return { type: "listItem", content: item.content.map(blockToEditor) };
}

/** The document in the editor's own JSON shape: what the editor is opened
 *  with, and what is stored, so a saved document reopens exactly as it was. */
export function toEditorJson(doc: RichDoc): { type: "doc"; content: EditorNode[] } {
  return {
    type: "doc",
    content: doc.content.length ? doc.content.map(blockToEditor) : [{ type: "paragraph" }],
  };
}

/** What goes in the column: the sanitised document as JSON, or null when it
 *  says nothing, so "cleared" reads the same as "never set". */
export function serializeRichText(doc: RichDoc): string | null {
  return isRichTextEmpty(doc) ? null : JSON.stringify(toEditorJson(doc));
}

/** A request body's `content` (the editor's JSON) as the value to store, or
 *  the reason it cannot be. Null means "cleared". */
export function parseRichTextInput(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (record?.type !== "doc") {
    return { ok: false, error: "The text could not be read. Please try again." };
  }
  const value = serializeRichText(sanitizeRichDoc(record));
  if (value && value.length > RICH_TEXT_MAX_STORED_LENGTH) {
    return { ok: false, error: "That is too long to show on a profile. Please shorten it." };
  }
  return { ok: true, value };
}
