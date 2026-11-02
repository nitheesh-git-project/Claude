import { cache } from "react";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { parseAdminSettings } from "@/lib/adminSettings";
import { publicContactLinks, type PublicContactLinks } from "@/lib/contactLinks";

/**
 * The WhatsApp and call links a public page may offer, from the same
 * Brand & Contact settings the footer reads. Only numbers an admin has
 * actually filled in come back non-null (the shipped "+91 XXXXX XXXXX" is not
 * a number), so a page can render `contact.whatsapp && ...` and never link to
 * nothing. Deduped within a request with the layout's own read.
 */
export const readPublicContact = cache(async (): Promise<PublicContactLinks> => {
  const { brand } = await getLayoutSettings();
  const settings = parseAdminSettings(brand);
  return publicContactLinks({
    whatsappNumber: settings.whatsappNumber,
    contactPhone: settings.contactPhone,
  });
});
