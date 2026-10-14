"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { safeHref, toEditorJson, type RichDoc } from "@/lib/richText";

/**
 * A Docs-style editor for public copy: type, press Enter for a new
 * paragraph, Shift+Enter for a line break, and format from the toolbar or
 * the usual shortcuts (Ctrl/Cmd+B, I, U, Shift+X, Z).
 *
 * The formatting on offer is the brand-safe set src/lib/richText.ts allows
 * -- nothing here can produce something the renderer would then drop. What
 * it hands back is the editor's JSON; the route sanitises it again before
 * storing, since a request body is not this component.
 */

const CONTENT_CLASS = [
  "min-h-[10rem] max-h-[28rem] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-slate-800 outline-none",
  "space-y-2 break-words",
  "[&_p]:min-h-[1em]",
  "[&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900",
  "[&_h3]:font-display [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-slate-900",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-teal-700 [&_a]:underline [&_a]:underline-offset-2",
  "[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
  "[&_p.is-editor-empty:first-child]:before:text-slate-400",
  "[&_p.is-editor-empty:first-child]:before:float-left",
  "[&_p.is-editor-empty:first-child]:before:h-0",
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none",
].join(" ");

type ToolButton = {
  key: string;
  label: string;
  icon: string;
  shortcut?: string;
  isActive?: (e: Editor) => boolean;
  run: (e: Editor) => void;
  canRun?: (e: Editor) => boolean;
};

const GROUPS: ToolButton[][] = [
  [
    { key: "undo", label: "Undo", icon: "fa-rotate-left", shortcut: "Ctrl+Z", run: (e) => e.chain().focus().undo().run(), canRun: (e) => e.can().undo() },
    { key: "redo", label: "Redo", icon: "fa-rotate-right", shortcut: "Ctrl+Shift+Z", run: (e) => e.chain().focus().redo().run(), canRun: (e) => e.can().redo() },
  ],
  [
    { key: "bold", label: "Bold", icon: "fa-bold", shortcut: "Ctrl+B", isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
    { key: "italic", label: "Italic", icon: "fa-italic", shortcut: "Ctrl+I", isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
    { key: "underline", label: "Underline", icon: "fa-underline", shortcut: "Ctrl+U", isActive: (e) => e.isActive("underline"), run: (e) => e.chain().focus().toggleUnderline().run() },
    { key: "strike", label: "Strikethrough", icon: "fa-strikethrough", shortcut: "Ctrl+Shift+X", isActive: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  ],
  [
    { key: "bullet", label: "Bulleted list", icon: "fa-list-ul", isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: "Numbered list", icon: "fa-list-ol", isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: "Quote", icon: "fa-quote-left", isActive: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  ],
  [
    { key: "left", label: "Align left", icon: "fa-align-left", isActive: (e) => !e.isActive({ textAlign: "center" }) && !e.isActive({ textAlign: "right" }), run: (e) => e.chain().focus().setTextAlign("left").run() },
    { key: "center", label: "Align centre", icon: "fa-align-center", isActive: (e) => e.isActive({ textAlign: "center" }), run: (e) => e.chain().focus().setTextAlign("center").run() },
    { key: "right", label: "Align right", icon: "fa-align-right", isActive: (e) => e.isActive({ textAlign: "right" }), run: (e) => e.chain().focus().setTextAlign("right").run() },
  ],
  [
    { key: "clear", label: "Clear formatting", icon: "fa-text-slash", run: (e) => e.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run() },
  ],
];

type BlockStyle = "paragraph" | "h2" | "h3";

export default function RichTextEditor({
  initialDoc,
  onChange,
  label,
  placeholder,
  testId,
}: {
  initialDoc: RichDoc;
  /** Called with the editor's JSON on every change. */
  onChange: (json: unknown) => void;
  /** The editor's accessible name. */
  label: string;
  placeholder?: string;
  testId?: string;
}) {
  const linkInputId = useId();
  // Held in a ref so the editor, created once, always calls the latest
  // handler. Updated in an effect, never during render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
    ],
    content: toEditorJson(initialDoc),
    editorProps: {
      attributes: {
        class: CONTENT_CLASS,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(testId ? { "data-testid": testId } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const block: BlockStyle = e.isActive("heading", { level: 2 })
        ? "h2"
        : e.isActive("heading", { level: 3 })
          ? "h3"
          : "paragraph";
      return {
        block,
        link: e.isActive("link"),
        active: Object.fromEntries(
          GROUPS.flat().map((b) => [b.key, b.isActive ? b.isActive(e) : false])
        ) as Record<string, boolean>,
        enabled: Object.fromEntries(
          GROUPS.flat().map((b) => [b.key, b.canRun ? b.canRun(e) : true])
        ) as Record<string, boolean>,
      };
    },
  });

  function setBlock(style: BlockStyle) {
    if (!editor) return;
    if (style === "paragraph") editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: style === "h2" ? 2 : 3 }).run();
  }

  function openLink() {
    if (!editor) return;
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const raw = linkValue.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const withProtocol = /^[a-z]+:/i.test(raw) ? raw : `https://${raw}`;
    const href = safeHref(withProtocol);
    if (!href) {
      setLinkError("Use a web address (https://...), an email (mailto:) or a phone number (tel:).");
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: raw, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  }

  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-slate-600 transition hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent";
  const btnOn = "bg-teal-100 text-teal-800 hover:bg-teal-100";

  return (
    <div className="rounded-xl border border-slate-300 bg-white focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1 rounded-t-xl"
      >
        <select
          aria-label="Text style"
          value={state?.block ?? "paragraph"}
          onChange={(e) => setBlock(e.target.value as BlockStyle)}
          disabled={!editor}
          className="mr-1 h-8 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700"
        >
          <option value="paragraph">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>
        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5 border-l border-slate-200 pl-1 ml-0.5 first:border-l-0 first:pl-0 first:ml-0">
            {group.map((b) => (
              <button
                key={b.key}
                type="button"
                aria-label={b.label}
                title={b.shortcut ? `${b.label} (${b.shortcut})` : b.label}
                aria-pressed={b.isActive ? !!state?.active[b.key] : undefined}
                disabled={!editor || state?.enabled[b.key] === false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor && b.run(editor)}
                className={`${btn} ${state?.active[b.key] ? btnOn : ""}`}
              >
                <i className={`fa-solid ${b.icon}`} aria-hidden="true" />
              </button>
            ))}
            {gi === 1 && (
              <button
                type="button"
                aria-label="Link"
                title="Link (Ctrl+K)"
                aria-pressed={!!state?.link}
                aria-expanded={linkOpen}
                disabled={!editor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={openLink}
                className={`${btn} ${state?.link ? btnOn : ""}`}
              >
                <i className="fa-solid fa-link" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      {linkOpen && (
        <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs">
          <label htmlFor={linkInputId} className="block font-semibold text-slate-700 mb-1">
            Link address
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={linkInputId}
              type="text"
              inputMode="url"
              autoFocus
              value={linkValue}
              onChange={(e) => {
                setLinkValue(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkOpen(false);
                  editor?.commands.focus();
                }
              }}
              placeholder="https://example.com"
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 p-1.5"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-lg bg-teal-700 px-3 py-1.5 font-semibold text-white hover:bg-teal-800"
            >
              Apply
            </button>
            {state?.link && (
              <button
                type="button"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  setLinkOpen(false);
                }}
                className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200"
              >
                Remove link
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLinkOpen(false);
                editor?.commands.focus();
              }}
              className="rounded-lg px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
          {linkError && (
            <p role="alert" className="mt-1 text-red-600">
              {linkError}
            </p>
          )}
        </div>
      )}
      <div
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openLink();
          }
        }}
      >
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="min-h-[10rem] px-3 py-2.5 text-sm text-slate-400">Loading editor…</div>
        )}
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
        Enter starts a new paragraph. Shift+Enter adds a line break.
      </p>
    </div>
  );
}
