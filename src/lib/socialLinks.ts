// The clinic's social profiles, shown as a row of icons in the website
// footer and edited on Settings -> Brand & Contact.
//
// Five optional `site_settings` columns, one per platform. **Blank means
// "we don't have one"** and the icon simply is not drawn -- an icon that
// leads nowhere, or to the platform's home page, is worse than no icon on
// the page a hesitant patient reads for evidence there is a real practice
// behind this. Same reading the footer already gives a placeholder phone
// number.
//
// Dependency-free so the one rule that matters -- what counts as a usable
// link -- is tested without rendering, and so the admin form, the save route
// and the footer all apply the very same check:
//
//   - **https only.** The value becomes an `href` on every public page; a
//     `javascript:` or `data:` URL there would run in a visitor's browser.
//     An `http://` link is upgraded rather than refused, and a bare
//     `instagram.com/clinic` gets `https://` put in front of it, because
//     that is how people copy a profile address.
//   - **The platform's own domain.** A Facebook field holding a YouTube link
//     is a paste into the wrong box, not a choice, so it is refused with a
//     sentence naming the right site.
//
// The footer re-checks what it reads rather than trusting the column: a
// value written before this check existed, or straight into the database,
// is dropped instead of rendered.

export type SocialPlatform = "instagram" | "facebook" | "linkedin" | "youtube" | "whatsapp";

export type SocialLinkDef = {
  platform: SocialPlatform;
  /** The `site_settings` column that holds this link. */
  column: string;
  label: string;
  /** Registrable domains a link for this platform may point at. A
   *  subdomain of one (m.facebook.com, chat.whatsapp.com) is accepted. */
  hosts: readonly string[];
  /** Shown as the input's placeholder, so the expected shape is visible. */
  example: string;
};

export const SOCIAL_LINKS: readonly SocialLinkDef[] = [
  {
    platform: "instagram",
    column: "social_instagram_url",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    example: "https://www.instagram.com/yourclinic",
  },
  {
    platform: "facebook",
    column: "social_facebook_url",
    label: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.me"],
    example: "https://www.facebook.com/yourclinic",
  },
  {
    platform: "linkedin",
    column: "social_linkedin_url",
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    example: "https://www.linkedin.com/company/yourclinic",
  },
  {
    platform: "youtube",
    column: "social_youtube_url",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    example: "https://www.youtube.com/@yourclinic",
  },
  {
    platform: "whatsapp",
    column: "social_whatsapp_url",
    label: "WhatsApp",
    hosts: ["wa.me", "whatsapp.com"],
    example: "https://wa.me/919876543210 or a WhatsApp channel link",
  },
];

export const SOCIAL_LINK_COLUMNS: readonly string[] = SOCIAL_LINKS.map((link) => link.column);

/** The select string for the five columns, read in its own call -- they are
 *  newer than the rest of `site_settings` (see siteSettingsCache.ts). */
export const SOCIAL_LINKS_SELECT = SOCIAL_LINK_COLUMNS.join(", ");

/** Matches the columns' own CHECK in schema.sql. */
export const MAX_SOCIAL_URL_LENGTH = 300;

export function socialLinkForColumn(column: string): SocialLinkDef | undefined {
  return SOCIAL_LINKS.find((link) => link.column === column);
}

export type SocialUrlResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * What to store for a link an admin typed: `null` for blank (hide the
 * icon), the cleaned https URL for a usable one, or a sentence saying why
 * it cannot be used.
 */
export function normaliseSocialUrl(platform: SocialPlatform, raw: unknown): SocialUrlResult {
  const def = SOCIAL_LINKS.find((link) => link.platform === platform);
  if (!def) return { ok: false, error: "Unknown social network." };
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Enter a link, or leave it blank." };

  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (/\s/.test(trimmed)) {
    return { ok: false, error: `That doesn't look like a ${def.label} link - it has a space in it.` };
  }

  // A scheme other than http(s) is refused outright rather than having
  // https:// glued in front of it, which would turn `javascript:alert(1)`
  // into a "link" to a host called javascript.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return { ok: false, error: `Enter a web link starting with https:// - for example ${def.example}.` };
  }
  const withScheme = scheme === "http" || scheme === "https" ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: `That doesn't look like a ${def.label} link - for example ${def.example}.` };
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return { ok: false, error: `Enter a web link starting with https:// - for example ${def.example}.` };
  }

  const host = url.hostname.toLowerCase();
  const onPlatform = def.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  if (!onPlatform) {
    return {
      ok: false,
      error: `That link isn't on ${def.label} (${def.hosts[0]}). Check it was pasted into the right box.`,
    };
  }

  const value = url.toString();
  if (value.length > MAX_SOCIAL_URL_LENGTH) {
    return { ok: false, error: `Please keep this to ${MAX_SOCIAL_URL_LENGTH} characters or fewer.` };
  }
  return { ok: true, value };
}

export type FooterSocialLink = { platform: SocialPlatform; label: string; href: string };

/**
 * The links the footer should draw, in the fixed platform order, from a
 * `site_settings` row. Blank and unusable values are left out, so a clinic
 * with only Instagram shows one icon and a clinic with none shows nothing.
 */
export function footerSocialLinks(
  row: Record<string, string | null | undefined> | null | undefined
): FooterSocialLink[] {
  if (!row) return [];
  const links: FooterSocialLink[] = [];
  for (const def of SOCIAL_LINKS) {
    const result = normaliseSocialUrl(def.platform, row[def.column]);
    if (result.ok && result.value) {
      links.push({ platform: def.platform, label: def.label, href: result.value });
    }
  }
  return links;
}
