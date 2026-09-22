import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A wrapped JSX text node carrying an HTML entity loses its leading space.
 *
 * This is Next's own compiler, not a style question. SWC decodes entities in
 * the same pass that normalises JSX whitespace, and where a text node both
 * carries an entity and spans more than one source line, the two disagree and
 * the node's leading space is dropped. Each half alone is harmless. Verified
 * directly against `next/dist/build/swc`, holding everything else equal:
 *
 *   one line, entity      -> "at least ", n, " hours' notice so a …"   kept
 *   wrapped, no entity    -> "at least ", n, " hours' notice so a …"   kept
 *   wrapped, entity       -> "at least ", n, "hours' notice so a …"    GONE
 *
 * So the sentence renders "at least 24hours' notice", and the pay-later
 * widget's read "For 1 sessionyou've already had". It is invisible in review,
 * invisible in the source, and invisible to esbuild -- which keeps the space,
 * so a Vitest or Playwright transform of the same file disagrees with what
 * the browser is actually served. This was found by reading pixels in a
 * screenshot, which is not a repeatable way to find the next one.
 *
 * Eight sentences in this app were broken this way, across the pay-later
 * widget, the home-visit wizard, two admin charts, the bulk scheduler and the
 * therapist's Health Profile list.
 *
 * The fix is always the same -- make the space a child in its own right,
 * `{" "}`, which nothing can trim. (Interpolating the whole sentence as a
 * template literal works too, and reads better where a ternary sits
 * mid-sentence.)
 *
 * Same shape and same reasoning as `formatDateTime.test.ts`'s walk for
 * unzoned dates: a mistake that produces no error is one a reviewer will not
 * catch.
 */

const ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);/;

/** JSX comments are not text nodes, and a comment's closing brace would
 *  otherwise read as the end of an expression with text after it. */
function stripJsxComments(src: string): string {
  return src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "{}");
}

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, acc);
    else if (name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

describe("JSX text after an expression never relies on a space beside an entity", () => {
  it("has no text run that SWC would glue to what precedes it", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("src")) {
      const src = stripJsxComments(readFileSync(file, "utf8"));
      // A JSX expression or element ends, a space follows, then a text run up
      // to the next `{` or `<`. That run is one text node. Both halves of the
      // rule are required: an entity, and a line break inside the run.
      for (const m of src.matchAll(/[}>][ \t]+([^<{}\s][^<{}]*)/g)) {
        const run = m[1];
        if (!ENTITY.test(run) || !run.includes("\n")) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line}  ${run.trim().slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
