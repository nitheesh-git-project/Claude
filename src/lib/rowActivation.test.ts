import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { rowActivationProps, type RowKeyboardEvent } from "@/lib/rowActivation";

type Row = { id: string };

function keyEvent(
  key: string,
  { onRow = true }: { onRow?: boolean } = {}
): RowKeyboardEvent<Row> & { prevented: boolean } {
  const row: Row = { id: "row" };
  const child: Row = { id: "child" };
  const event = {
    key,
    target: (onRow ? row : child) as unknown as EventTarget,
    currentTarget: row,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

describe("rowActivationProps", () => {
  it("puts the row in the tab order and says what activating it does", () => {
    const props = rowActivationProps<Row>(() => {});
    expect(props.tabIndex).toBe(0);
    expect(props["aria-haspopup"]).toBe("dialog");
  });

  it("opens on Enter and on Space", () => {
    for (const key of ["Enter", " "]) {
      const onActivate = vi.fn();
      const props = rowActivationProps<Row>(onActivate);
      props.onKeyDown(keyEvent(key));
      expect(onActivate, `${key} should activate the row`).toHaveBeenCalledTimes(1);
    }
  });

  it("swallows Space so the page does not scroll under the dialog", () => {
    const event = keyEvent(" ");
    rowActivationProps<Row>(() => {}).onKeyDown(event);
    expect(event.prevented).toBe(true);
  });

  it("ignores every other key", () => {
    for (const key of ["Tab", "Escape", "a", "ArrowDown", "Shift"]) {
      const onActivate = vi.fn();
      const event = keyEvent(key);
      rowActivationProps<Row>(onActivate).onKeyDown(event);
      expect(onActivate, `${key} should not activate the row`).not.toHaveBeenCalled();
      expect(event.prevented, `${key} should keep its default`).toBe(false);
    }
  });

  it("leaves a key pressed on a control inside the row to that control", () => {
    const onActivate = vi.fn();
    const event = keyEvent("Enter", { onRow: false });
    rowActivationProps<Row>(onActivate).onKeyDown(event);
    expect(onActivate).not.toHaveBeenCalled();
    expect(event.prevented).toBe(false);
  });

  it("clicks through exactly as the bare onClick it replaces did", () => {
    const onActivate = vi.fn();
    rowActivationProps<Row>(onActivate).onClick();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

/**
 * The walk that stops the next one.
 *
 * All nine offenders were `<tr onClick={...}>` / `<li onClick={...}>` with no
 * tab stop and no key handler, and not one of them produced an error, a
 * failing request or a wrong row -- the screen worked perfectly with a mouse.
 * Same shape and same reasoning as `formatDateTime.test.ts`'s walk for unzoned
 * dates and `jsxEntitySpacing.test.ts`'s for glued sentences: a mistake that
 * produces no error is one a reviewer will not catch.
 */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, acc);
    else if (name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/** The opening tag starting at `from`, brace- and string-aware so a `>` inside
 *  an expression or a template literal does not end it early. */
function openingTag(src: string, from: number): string {
  let i = from;
  let depth = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; i += 1; continue; }
    if (c === "{") { depth += 1; i += 1; continue; }
    if (c === "}") { depth -= 1; i += 1; continue; }
    if (depth === 0 && c === ">") break;
    i += 1;
  }
  return src.slice(from, i + 1);
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("a row you can tap is a row you can reach", () => {
  it("has no <tr> or <li> that opens something on click and nothing else", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("src")) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const element of ["tr", "li"] as const) {
        const pattern = new RegExp(`<${element}(?=[\\s/>])`, "g");
        for (const match of src.matchAll(pattern)) {
          const tag = openingTag(src, match.index);
          if (!tag.includes("onClick")) continue;
          // stopPropagation is a row's *child* shielding itself, not an action.
          if (/onClick=\{\(e[^)]*\)\s*=>\s*e\.stopPropagation\(\)\}/.test(tag)) continue;
          const reachable =
            tag.includes("rowActivationProps") ||
            tag.includes("tabIndex") ||
            tag.includes("onKeyDown") ||
            tag.includes('role="button"');
          if (!reachable) {
            const line = src.slice(0, match.index).split("\n").length;
            offenders.push(`${file}:${line} <${element}> opens on click with no keyboard path`);
          }
        }
      }
    }
    expect(
      offenders,
      `Spread rowActivationProps(...) in place of the bare onClick:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
