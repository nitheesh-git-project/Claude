import type { PDFFont } from "pdf-lib";

// Text plumbing shared by every PDF this app generates (the patient's
// health profile, and the admin's table exports). Both use pdf-lib's
// standard fonts, which is what makes both of these necessary.

/**
 * pdf-lib's standard fonts can only encode WinAnsi, and an unencodable
 * character throws at draw time -- which would 500 an export rather than
 * degrade it. Transliterate the handful that show up in ordinary typing
 * (curly quotes, dashes, the rupee sign) and drop the rest.
 */
export function toWinAnsi(value: string): string {
  const replaced = value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/₹/g, "Rs. ");
  // Keep only what the WinAnsi tables can actually encode.
  return replaced.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "");
}

/** Whitespace-collapsed WinAnsi, for a value whose leftovers would show --
 *  a name in a script the fonts cannot encode otherwise leaves stray
 *  spaces around whatever Latin part survives. */
export function toWinAnsiTidy(value: string, fallback: string): string {
  return toWinAnsi(value).replace(/\s+/g, " ").trim() || fallback;
}

/** Greedy word wrap at a pixel width, breaking a single over-wide token
 *  (a long URL, a pasted id) by character rather than looping forever. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Cuts a single line to fit, with an ellipsis. Table cells truncate
 *  rather than wrap: a wrapped cell makes every row a different height,
 *  which is what turns a scannable table into a wall. */
export function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}
