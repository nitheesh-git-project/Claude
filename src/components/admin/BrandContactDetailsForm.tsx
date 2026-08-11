"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

async function saveSetting(key: string, value: string) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

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
}: {
  settingKey: string;
  label: string;
  value: string;
  type?: "text" | "email";
  multiline?: boolean;
}) {
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
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("This can't be blank.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveSetting(settingKey, trimmed);
        setSavedValue(trimmed);
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
            <p className="min-w-0 break-words text-sm text-slate-600">{savedValue}</p>
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
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none"
              />
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
      <h2 className="font-bold text-lg text-slate-800 mb-1">Brand &amp; Contact Details</h2>
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
    </div>
  );
}
