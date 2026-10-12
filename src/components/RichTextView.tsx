import type { ReactNode } from "react";
import {
  parseRichText,
  type RichAlign,
  type RichBlock,
  type RichDoc,
  type RichInline,
} from "@/lib/richText";

/**
 * A stored rich-text value (src/lib/richText.ts) as page elements.
 *
 * Built from the sanitised tree into React elements -- never HTML -- so it
 * renders the same on the server and the client and there is nothing to
 * inject. Typography is the page's own: the component sets structure and
 * spacing, and text colour comes from the container it sits in, which is how
 * the admin's grey "saved" view and the public teal note share one renderer.
 */

const ALIGN_CLASS: Record<RichAlign, string> = {
  left: "",
  center: "text-center",
  right: "text-right",
};

function renderInline(content: RichInline[], keyPrefix: string): ReactNode[] {
  return content.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (node.type === "hardBreak") return <br key={key} />;
    let el: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold":
          el = <strong className="font-semibold">{el}</strong>;
          break;
        case "italic":
          el = <em>{el}</em>;
          break;
        case "underline":
          el = <u>{el}</u>;
          break;
        case "strike":
          el = <s>{el}</s>;
          break;
        case "link":
          el = (
            <a
              href={mark.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              {el}
            </a>
          );
          break;
      }
    }
    return <span key={key}>{el}</span>;
  });
}

function renderBlock(block: RichBlock, key: string): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key} className={`min-h-[1em] ${block.align ? ALIGN_CLASS[block.align] : ""}`}>
          {renderInline(block.content, key)}
        </p>
      );
    case "heading": {
      const Tag = block.level === 2 ? "h3" : "h4";
      return (
        <Tag
          key={key}
          className={`font-display font-bold ${block.level === 2 ? "text-base" : "text-sm"} ${
            block.align ? ALIGN_CLASS[block.align] : ""
          }`}
        >
          {renderInline(block.content, key)}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {block.content.map((item, i) => (
            <li key={`${key}-${i}`} className="space-y-1">
              {item.content.map((b, j) => renderBlock(b, `${key}-${i}-${j}`))}
            </li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5">
          {block.content.map((item, i) => (
            <li key={`${key}-${i}`} className="space-y-1">
              {item.content.map((b, j) => renderBlock(b, `${key}-${i}-${j}`))}
            </li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="space-y-2 border-l-2 border-current/30 pl-3 italic opacity-90">
          {block.content.map((b, i) => renderBlock(b, `${key}-${i}`))}
        </blockquote>
      );
  }
}

export default function RichTextView({
  value,
  doc,
  className = "",
  testId,
}: {
  /** The stored column value: a document, old plain text, or nothing. */
  value?: string | null;
  /** An already-parsed document, instead of `value`. */
  doc?: RichDoc;
  className?: string;
  testId?: string;
}) {
  const parsed = doc ?? parseRichText(value);
  if (parsed.content.length === 0) return null;
  return (
    <div className={`space-y-2 break-words ${className}`} data-testid={testId}>
      {parsed.content.map((block, i) => renderBlock(block, `b${i}`))}
    </div>
  );
}
