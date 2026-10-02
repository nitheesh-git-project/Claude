"use client";

import { useState, useTransition } from "react";
import { useSaveSetting } from "@/lib/useSaveSetting";
import { useRouter } from "@/lib/useRouter";
import { SOCIAL_LINKS, normaliseSocialUrl, type SocialLinkDef } from "@/lib/socialLinks";

/**
 * One row of the section below: label, current value, an Edit button that
 * swaps the row into an input + Save/Cancel. Every field in
 * BrandContactDetailsForm goes through this same component so the edit
 * interaction is identical field to field, per the brief this was built
 * from ("this should be consistent for all the settings in this tab").
 */
function EditableField({
  settingKey,
  label,
  value,
  type = "text",
  multiline = false,
  social,
}: {
  settingKey: string;
  label: string;
  value: string;
  type?: "text" | "email";
  multiline?: boolean;
  /** A social link: blank is allowed (it hides the icon) and the value is
   *  checked and cleaned by the same rule the save route applies. */
  social?: SocialLinkDef;
}) {
  const saveSetting = useSaveSetting();
  const [editing, setEditing] = useState(false);
  const [savedValue, setSavedValue] = useState(value);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function startEdit() {
    setDraft(savedValue);
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    let next: string | null = draft.trim();
    if (social) {
      // Checked here as well as on the server so the sentence arrives
      // before a round trip, and so the row shows the cleaned link (with
      // https:// added) rather than what was typed.
      const result = normaliseSocialUrl(social.platform, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      next = result.value;
    } else if (!next) {
      setError("This can't be blank.");
      return;
    }
    const toSave = next;
    setError(null);
    startTransition(async () => {
      try {
        await saveSetting(settingKey, toSave);
        setSavedValue(toSave ?? "");
        setEditing(false);
        // Navbar/Footer read this from the root layout, not from anything
        // on this page -- refresh so the layout's own data (and this admin
        // page) both pick up the new value immediately instead of on the
        // next unrelated navigation.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-6">
      <p className="w-full shrink-0 text-sm font-semibold text-slate-800 sm:w-48">{label}</p>
      <div className="min-w-0 flex-1">
        {!editing ? (
          <div className="flex items-start justify-between gap-3">
            {savedValue || !social ? (
              <p className="min-w-0 break-words text-sm text-slate-600">{savedValue}</p>
            ) : (
              <p className="min-w-0 text-sm italic text-slate-500">Not set - no icon in the footer</p>
            )}
            <button
              type="button"
              onClick={startEdit}
              className="shrink-0 text-xs font-semibold text-teal-700 hover:underline"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {error && <p className="text-xs text-red-600">{error}</p>}
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            ) : (
              <input
                type={type}
                value={draft}
                aria-label={label}
                placeholder={social?.example}
                inputMode={social ? "url" : undefined}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            )}
            {social && (
              <p className="text-[11px] text-slate-500">
                Paste the full link to your {social.label} page. Leave it empty and save to remove the icon.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={isPending}
                className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-300 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type BrandContactDetails = {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  contactEmail: string;
  whatsappNumber: string;
  contactPhone: string;
  footerCopyrightText: string;
  /** Keyed by column (social_instagram_url, ...); blank when not set. */
  socialLinks: Record<string, string>;
};

/**
 * Site Content's "Brand & Contact Details" section -- the practice name,
 * tagline, description, and contact info that the public Navbar and Footer
 * previously had hardcoded. Each field saves independently to its own
 * site_settings column via /api/admin/update-setting; once saved it's live
 * everywhere that value renders (see update-setting's revalidatePath("/",
 * "layout") call), not just on this page.
 */
export default function BrandContactDetailsForm({ details }: { details: BrandContactDetails }) {
  return (
    <div>
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Brand &amp; Contact Details</h2>
      <p className="text-xs text-slate-500 mb-2">
        The practice name, tagline, and contact info shown across the site&apos;s
        navigation and footer. Editing a field here updates it everywhere it&apos;s
        displayed.
      </p>
      <div>
        <EditableField settingKey="site_name" label="Website Name" value={details.siteName} />
        <EditableField settingKey="site_tagline" label="Tagline" value={details.siteTagline} />
        <EditableField
          settingKey="site_description"
          label="Description"
          value={details.siteDescription}
          multiline
        />
        <EditableField
          settingKey="contact_email"
          label="Contact Email"
          value={details.contactEmail}
          type="email"
        />
        <EditableField
          settingKey="whatsapp_number"
          label="WhatsApp Number"
          value={details.whatsappNumber}
        />
        <EditableField
          settingKey="contact_phone"
          label="Contact Number"
          value={details.contactPhone}
        />
        <EditableField
          settingKey="footer_copyright_text"
          label="Footer Copyright Text"
          value={details.footerCopyrightText}
        />
      </div>

      <h3 className="mt-8 font-display text-base font-bold text-slate-800 mb-1">Social Media Links</h3>
      <p className="text-xs text-slate-500 mb-2">
        Shown as icons in the website footer, opening in a new tab. Only the ones you fill in
        appear - leave a network empty and it is hidden automatically.
      </p>
      <div>
        {SOCIAL_LINKS.map((link) => (
          <EditableField
            key={link.column}
            settingKey={link.column}
            label={link.label}
            value={details.socialLinks[link.column] ?? ""}
            social={link}
          />
        ))}
      </div>
    </div>
  );
}
