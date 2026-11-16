import type { NextRequest } from "next/server";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { parseAdminSettings } from "@/lib/adminSettings";
import { LEGAL_FACTS } from "@/lib/legal/legalFacts";
import type { EmailBrand } from "@/lib/legalEmails";

/** The brand an email is signed with, and the Grievance Officer's inbox
 *  (the legal facts' address, else the site's contact email). */
export async function legalEmailContext(request: NextRequest): Promise<{ brand: EmailBrand; officerEmail: string }> {
  const { brand } = await getLayoutSettings();
  const settings = parseAdminSettings(brand);
  return {
    brand: { siteName: settings.siteName, siteUrl: request.nextUrl.origin },
    officerEmail: LEGAL_FACTS.grievanceOfficerEmail.trim() || settings.contactEmail,
  };
}
