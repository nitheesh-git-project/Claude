/**
 * The two icons that were each costing a whole webfont file.
 *
 * Font Awesome ships one font per style, and the browser downloads a style's
 * font as soon as one glyph from it is rendered. The site used exactly one
 * `fa-brands` icon (WhatsApp, in the footer, on every page) and exactly one
 * `fa-regular` icon (the calendar in DateField) -- and those two icons were
 * pulling 113 KB and 19 KB of webfont respectively, on top of the 117 KB
 * solid font every other icon shares.
 *
 * Inlined as SVG they cost about 1 KB of markup between them, and
 * `globals.css` no longer loads the brands or regular stylesheets at all, so
 * neither font is requested by anything. The paths below are copied verbatim
 * from `@fortawesome/fontawesome-free/svgs/`, so they are the same shapes
 * that were rendering before, not lookalikes.
 *
 * `fill="currentColor"` is what keeps them behaving like the font icons they
 * replace: they inherit the text colour of whatever wraps them, so the
 * existing `text-teal-500` / `text-slate-500` classes still apply.
 *
 * Add another icon from a non-solid style and the cheaper move is to add it
 * here rather than to re-enable that style's stylesheet for one glyph. See
 * docs/rules/frontend.md.
 */

type GlyphProps = {
  className?: string;
  /** Decorative by default: these sit beside text that already says what
   *  they mean, and a screen reader announcing "whatsapp" before the number
   *  is noise. Pass a title only where the glyph is the sole label. */
  title?: string;
};

function Glyph({
  className,
  title,
  path,
  viewBox = "0 0 448 512",
}: GlyphProps & { path: string; viewBox?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      className={className}
      // Matches the 1em box a Font Awesome <i> occupies, so these drop into
      // the existing layouts without shifting anything.
      width="1em"
      height="1em"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}

const WHATSAPP_PATH =
  "M380.9 97.1c-41.9-42-97.7-65.1-157-65.1-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480 117.7 449.1c32.4 17.7 68.9 27 106.1 27l.1 0c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3 18.6-68.1-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1s56.2 81.2 56.1 130.5c0 101.8-84.9 184.6-186.6 184.6zM325.1 300.5c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8s-14.3 18-17.6 21.8c-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7s-12.5-30.1-17.1-41.2c-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2s-9.7 1.4-14.8 6.9c-5.1 5.6-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4s4.6-24.1 3.2-26.4c-1.3-2.5-5-3.9-10.5-6.6z";

const CALENDAR_PATH =
  "M120 0c13.3 0 24 10.7 24 24l0 40 160 0 0-40c0-13.3 10.7-24 24-24s24 10.7 24 24l0 40 32 0c35.3 0 64 28.7 64 64l0 288c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l32 0 0-40c0-13.3 10.7-24 24-24zm0 112l-56 0c-8.8 0-16 7.2-16 16l0 48 352 0 0-48c0-8.8-7.2-16-16-16l-264 0zM48 224l0 192c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-192-352 0z";

/** Replaces `fa-brands fa-whatsapp`. */
export function WhatsAppGlyph(props: GlyphProps) {
  return <Glyph {...props} path={WHATSAPP_PATH} />;
}

/** Replaces `fa-regular fa-calendar`. The solid calendar is a filled block
 *  at small sizes, which is why this one is the outline rather than a swap
 *  to `fa-solid fa-calendar`. */
export function CalendarOutlineGlyph(props: GlyphProps) {
  return <Glyph {...props} path={CALENDAR_PATH} />;
}

// The footer's social links (src/lib/socialLinks.ts). Same source and the
// same reasoning as WhatsApp above: four brand icons are not worth the
// 113 KB fa-brands webfont. Each keeps its own viewBox from the source file,
// so the shapes are not stretched into the 448-wide box the others share.
const INSTAGRAM_PATH =
  "M224.3 141a115 115 0 1 0 -.6 230 115 115 0 1 0 .6-230zm-.6 40.4a74.6 74.6 0 1 1 .6 149.2 74.6 74.6 0 1 1 -.6-149.2zm93.4-45.1a26.8 26.8 0 1 1 53.6 0 26.8 26.8 0 1 1 -53.6 0zm129.7 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM399 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z";
const FACEBOOK_PATH =
  "M80 299.3l0 212.7 116 0 0-212.7 86.5 0 18-97.8-104.5 0 0-34.6c0-51.7 20.3-71.5 72.7-71.5 16.3 0 29.4 .4 37 1.2l0-88.7C291.4 4 256.4 0 236.2 0 129.3 0 80 50.5 80 159.4l0 42.1-66 0 0 97.8 66 0z";
const LINKEDIN_PATH =
  "M100.3 448l-92.9 0 0-299.1 92.9 0 0 299.1zM53.8 108.1C24.1 108.1 0 83.5 0 53.8 0 39.5 5.7 25.9 15.8 15.8s23.8-15.8 38-15.8 27.9 5.7 38 15.8 15.8 23.8 15.8 38c0 29.7-24.1 54.3-53.8 54.3zM447.9 448l-92.7 0 0-145.6c0-34.7-.7-79.2-48.3-79.2-48.3 0-55.7 37.7-55.7 76.7l0 148.1-92.8 0 0-299.1 89.1 0 0 40.8 1.3 0c12.4-23.5 42.7-48.3 87.9-48.3 94 0 111.3 61.9 111.3 142.3l0 164.3-.1 0z";
const YOUTUBE_PATH =
  "M549.7 124.1C543.5 100.4 524.9 81.8 501.4 75.5 458.9 64 288.1 64 288.1 64S117.3 64 74.7 75.5C51.2 81.8 32.7 100.4 26.4 124.1 15 167 15 256.4 15 256.4s0 89.4 11.4 132.3c6.3 23.6 24.8 41.5 48.3 47.8 42.6 11.5 213.4 11.5 213.4 11.5s170.8 0 213.4-11.5c23.5-6.3 42-24.2 48.3-47.8 11.4-42.9 11.4-132.3 11.4-132.3s0-89.4-11.4-132.3zM232.2 337.6l0-162.4 142.7 81.2-142.7 81.2z";

/** `fa-brands fa-instagram`, inlined. */
export function InstagramGlyph(props: GlyphProps) {
  return <Glyph {...props} viewBox="0 0 448 512" path={INSTAGRAM_PATH} />;
}

/** `fa-brands fa-facebook-f`, inlined. */
export function FacebookGlyph(props: GlyphProps) {
  return <Glyph {...props} viewBox="0 0 320 512" path={FACEBOOK_PATH} />;
}

/** `fa-brands fa-linkedin-in`, inlined. */
export function LinkedInGlyph(props: GlyphProps) {
  return <Glyph {...props} viewBox="0 0 448 512" path={LINKEDIN_PATH} />;
}

/** `fa-brands fa-youtube`, inlined. */
export function YouTubeGlyph(props: GlyphProps) {
  return <Glyph {...props} viewBox="0 0 576 512" path={YOUTUBE_PATH} />;
}
