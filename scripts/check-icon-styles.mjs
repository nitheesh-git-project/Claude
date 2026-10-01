#!/usr/bin/env node
/**
 * Fails the lint when the app uses a Font Awesome style whose stylesheet
 * globals.css does not load.
 *
 * globals.css imports `fontawesome.min.css` + `solid.min.css`, not
 * `all.min.css`. That is deliberate and is worth about 130 KB per visitor
 * (the reasoning is in the comment above those imports), but it has a sharp
 * edge: writing `fa-brands fa-whatsapp` in a component no longer renders a
 * WhatsApp icon. It renders **nothing** -- no error, no fallback, no console
 * warning, just an empty inline box where an icon should be. That is exactly
 * the kind of failure nobody notices until a patient does.
 *
 * So the rule is checked rather than remembered: use a style that is not
 * loaded and the build stops and tells you to inline the glyph into
 * src/components/visuals/BrandGlyphs.tsx instead, which is what the two
 * icons that used to need those fonts already do.
 *
 * Re-enabling a style is a legitimate answer too -- if the app ever needs a
 * dozen brand icons, the font is cheaper than a dozen inline paths. Doing it
 * means importing that stylesheet in globals.css, which this check reads, so
 * it passes automatically once the import is there.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");

/** Every Font Awesome style, and the stylesheet that defines each one. */
const STYLES = {
  "fa-solid": "solid",
  "fa-regular": "regular",
  "fa-brands": "brands",
  "fa-light": "light",
  "fa-thin": "thin",
  "fa-duotone": "duotone",
};

const loaded = new Set(
  Object.entries(STYLES)
    .filter(
      ([, sheet]) =>
        css.includes(`fontawesome-free/css/${sheet}.min.css`) ||
        css.includes(`fontawesome-free/css/${sheet}.css`) ||
        css.includes("fontawesome-free/css/all.min.css") ||
        css.includes("fontawesome-free/css/all.css")
    )
    .map(([style]) => style)
);

/** Source files that can put a class name in front of a user. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Blanks comments while keeping line numbers intact, so a finding still
 * points at the right line.
 *
 * Comments have to come out before the scan, not be tolerated by it: the
 * files most likely to *write* "fa-brands" in prose are the ones explaining
 * why fa-brands is not loaded -- BrandGlyphs.tsx and the globals.css import
 * block. A check that fails on its own documentation teaches people to
 * delete the documentation.
 *
 * `//` is only treated as a comment when it does not follow a colon, so the
 * "https://" in a URL does not blank the rest of a line that might carry a
 * real class name.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, before) => before + " ".repeat(match.length - before.length));
}

const failures = [];

for (const file of sourceFiles(path.join(root, "src"))) {
  // globals.css itself names every style in the explanatory comment above
  // the imports; it is the declaration, not a usage.
  if (file.endsWith(path.join("app", "globals.css"))) continue;
  const text = stripComments(readFileSync(file, "utf8"));
  text.split("\n").forEach((line, index) => {
    for (const style of Object.keys(STYLES)) {
      if (loaded.has(style)) continue;
      // Word-bounded, so `fa-solid` does not match inside a longer token.
      if (!new RegExp(`\\b${style}\\b`).test(line)) continue;
      failures.push(
        `  ${path.relative(root, file)}:${index + 1}  uses ${style},` +
          ` whose stylesheet globals.css does not import`
      );
    }
  });
}

if (failures.length > 0) {
  console.error(
    `Icon style check FAILED - ${failures.length} usage` +
      `${failures.length === 1 ? "" : "s"} of an unloaded Font Awesome style:\n`
  );
  console.error(failures.join("\n"));
  console.error(
    "\nThese render as an empty box, silently. Either inline the glyph in" +
      " src/components/visuals/BrandGlyphs.tsx (what the WhatsApp and" +
      " calendar icons do, and what saved ~130 KB per visitor), or import" +
      " that style's stylesheet in globals.css and accept its webfont."
  );
  process.exit(1);
}

console.log(
  `Icon styles OK - loaded: ${[...loaded].join(", ") || "none"};` +
    ` no usage of any unloaded style.`
);
