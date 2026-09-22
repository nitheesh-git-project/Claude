import type { ReactNode } from "react";

/**
 * A jump strip for a settings screen that is several screens tall.
 *
 * Settings → Public Site is 4,300 pixels of stacked cards; Programmes & Home
 * Visits is 3,100. Both are correctly *one* screen -- everything on them
 * answers the same question -- but an owner who came to answer a new FAQ
 * scrolled past the mission, four promises, three limits and the opening
 * splash to reach it, with nothing on screen saying what was below. That is
 * the "important settings buried" failure rather than a grouping one, so the
 * fix is a map of the screen rather than another sidebar entry.
 *
 * Plain `<a href="#id">` anchors, not a scroll handler: they work before
 * hydration, middle-click, and are readable by a screen reader as the list of
 * what is on this page. The ids are prefixed per screen by the caller,
 * because the shell keeps every screen mounted behind `hidden` -- two screens
 * naming a section "Testimonials" would otherwise collide on one id and the
 * browser would scroll to whichever rendered first.
 *
 * Sticky under the page header. The dashboard scrolls the document rather
 * than an inner container, so `sticky` needs no scroll parent.
 */
export default function SettingsJumpNav({
  sections,
  offsetTop = false,
}: {
  sections: { id: string; label: string }[];
  /** Whether the pre-launch debug bar is on screen. It is `fixed` and 41px
   *  tall, so a strip stuck to `top-0` parks underneath it and is invisible
   *  exactly when it is needed. Same 41px AdminShell's own sidebar offsets
   *  by, and the same prop name, so the two move together when the bar is
   *  finally deleted. */
  offsetTop?: boolean;
}) {
  if (sections.length < 3) return null;
  return (
    <nav
      aria-label="Jump to a section of this screen"
      className={`sticky z-20 -mx-1 mb-2 flex flex-wrap gap-1.5 rounded-xl border border-slate-200/70 bg-slate-50 px-1.5 py-2 shadow-sm ${
        offsetTop ? "top-[41px]" : "top-0"
      }`}
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-800"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * One block on such a screen. The id is what the strip above links to, and
 * `scroll-mt` keeps the heading clear of the sticky strip once it lands --
 * without it the anchor puts the first line of the block underneath the strip
 * that sent you there.
 */
export function SettingsSection({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      {children}
    </section>
  );
}
