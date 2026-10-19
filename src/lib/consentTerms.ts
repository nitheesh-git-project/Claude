// The consent a patient gives on Step 2 of /book, in one place.
//
// DRAFT WORDING -- OWNER/LEGAL TO REVIEW. Nothing below has been reviewed by
// the clinic's owner or a lawyer. It is written to be accurate for every
// service the clinic sells by video (musculoskeletal, neurological and
// paediatric alike), so it makes no specialty-specific claim; the chosen
// service is named rather than assumed. Edit the text here -- the checkbox
// label and the dialog both read it, so they cannot drift apart.
//
// Why it exists: the checkbox asked a patient to agree to "the Telehealth
// Consent Terms & Emergency Disclaimer" with no way to read them, and said
// the service was "for non-emergency musculoskeletal care" to a patient
// booking a neurological or paediatric one. Dependency-free so it can be
// tested without rendering.

export const CONSENT_TERMS_TITLE = "Consent terms & emergency disclaimer";

export type ConsentSection = { heading: string; body: string };

export type ConsentTerms = {
  title: string;
  /** One line under the title naming what is being consented to. */
  intro: string;
  sections: ConsentSection[];
};

/** "Back & Neck Pain" as given, or a neutral phrase when nothing is chosen. */
function serviceName(serviceTitle: string | null | undefined): string | null {
  const t = serviceTitle?.trim();
  return t ? t : null;
}

/** The checkbox's sentence around the link to the terms. */
export function consentCheckboxText(serviceTitle: string | null | undefined): {
  before: string;
  linkText: string;
  after: string;
} {
  const name = serviceName(serviceTitle);
  return {
    before: "I agree to the ",
    linkText: CONSENT_TERMS_TITLE,
    after: name
      ? ` for my ${name} video session. I understand it is not an emergency service.`
      : " for my video session. I understand it is not an emergency service.",
  };
}

export function consentTerms(serviceTitle: string | null | undefined): ConsentTerms {
  const name = serviceName(serviceTitle);
  const session = name ? `your ${name} session` : "your session";
  return {
    title: CONSENT_TERMS_TITLE,
    intro: name
      ? `These terms apply to ${session}, a live video consultation with a licensed physiotherapist.`
      : "These terms apply to your session, a live video consultation with a licensed physiotherapist.",
    sections: [
      {
        heading: "What a video session is",
        body: "A one-to-one consultation over live video. Your physiotherapist assesses you from what they can see and what you tell them, and gives advice and exercises based on that assessment.",
      },
      {
        heading: "What it cannot do",
        body: "A video session cannot include a hands-on examination or hands-on treatment. If your physiotherapist thinks you need one, or need to see a doctor, they will tell you.",
      },
      {
        heading: "Staying safe during the session",
        body: "Use a clear space with room to move, and have someone nearby if you are at risk of falling. Stop and tell your physiotherapist straight away if anything causes pain, dizziness or breathlessness. A patient under 18 must have a parent or guardian present for the whole session.",
      },
      {
        heading: "Not for emergencies",
        body: "This service is not for emergencies. For chest pain, difficulty breathing, sudden weakness or numbness, a serious injury or any other urgent problem, call your local emergency number (112 in India) or go to the nearest emergency department.",
      },
      {
        heading: "Your information",
        body: "What you share before and during the session is kept in your patient record and used to provide your care.",
      },
      {
        heading: "Changing your mind",
        body: "You can end a session at any time. Cancelling a booking follows the cancellation terms shown before you pay.",
      },
    ],
  };
}
