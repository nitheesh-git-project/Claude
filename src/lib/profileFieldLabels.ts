import { parseRichText, richTextToPlain } from "@/lib/richText";

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  full_name: "Full Name",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  credentials: "Credentials / License",
  specialization: "Specialist In",
  years_experience: "Years of Experience",
  phone: "Phone Number",
  bio: "Bio (Our Team page)",
  organization_name: "Organisation Name",
  // A partner's email is also their sign-in; approving it moves the login.
  email: "Email (sign-in)",
};

/** A requested value as an admin reads it in a review list. Most fields
 *  are plain strings; the bio is stored rich-text JSON, shown as its words
 *  (cut at 280 characters -- the full text is on the Team page once live). */
export function profileChangeValueText(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return field === "bio" ? "(no bio)" : "(not set)";
  if (field === "bio" && typeof value === "string") {
    const plain = richTextToPlain(parseRichText(value)).replace(/\s+/g, " ").trim();
    return plain.length > 280 ? `${plain.slice(0, 279)}…` : plain || "(no bio)";
  }
  return String(value);
}
