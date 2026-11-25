// Chat to book's data and its hand-off into the booking wizard. Dependency-free
// so the links are testable without a browser (ChatToBook.tsx is the screen).

import { homeVisitBookHref } from "./homeVisitRates";

export type ChatMode = "video" | "home";

export type ChatCareOption = {
  id: string;
  title: string;
  imageUrl: string | null;
  videoPricePaise: number;
  /** Present only when this care can be booked as a home visit. */
  homeVisit: { pricePaise: number } | null;
};

/**
 * Where "Pick a time" goes: the wizard for that mode, with the care chosen.
 * A physiotherapist is a *request* (`?therapist=`), honoured by the video
 * wizard the same way "Book with Dr X" from the team page is; the clinic still
 * assigns. The home-visit wizard has no request, so none is sent there.
 */
export function chatBookingHref({
  categoryId,
  mode,
  therapistId,
}: {
  categoryId: string;
  mode: ChatMode;
  therapistId: string | null;
}): string {
  if (mode === "home") return homeVisitBookHref(categoryId);
  const params = new URLSearchParams({ from: "dashboard", category: categoryId });
  if (therapistId) params.set("therapist", therapistId);
  return `/book?${params.toString()}`;
}

/** The care the chat offers: what the Book hub offers, in the same order,
 *  with a home-visit price where the clinic has one. */
export function chatCareOptions(
  categories: { id: string; title: string; price_paise: number; image_url?: string | null }[],
  homeVisitConditions: { id: string; price_paise: number }[]
): ChatCareOption[] {
  const home = new Map(homeVisitConditions.map((c) => [c.id, c.price_paise]));
  return categories.map((c) => ({
    id: c.id,
    title: c.title,
    imageUrl: c.image_url ?? null,
    videoPricePaise: c.price_paise,
    homeVisit: home.has(c.id) ? { pricePaise: home.get(c.id) as number } : null,
  }));
}
