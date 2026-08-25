import type { StaticImageData } from "next/image";

import heroConditions from "../../public/photos/hero-conditions.jpg";
import heroFaq from "../../public/photos/hero-faq.jpg";
import heroHomeVisit from "../../public/photos/hero-home-visit.jpg";
import heroHospitals from "../../public/photos/hero-hospitals.jpg";
import heroHowItWorks from "../../public/photos/hero-how-it-works.jpg";
import heroTeam from "../../public/photos/hero-team.jpg";
import heroTherapy from "../../public/photos/hero-therapy.jpg";
import modeHomeVisit from "../../public/photos/mode-home-visit.jpg";
import modeVideo from "../../public/photos/mode-video.jpg";
import reports from "../../public/photos/reports.jpg";
import stepAssess from "../../public/photos/step-assess.jpg";
import stepBook from "../../public/photos/step-book.jpg";
import stepProgress from "../../public/photos/step-progress.jpg";

/**
 * Every photograph the public marketing pages use, in one place.
 *
 * Static imports rather than `/photos/x.jpg` string paths on purpose: Next
 * reads the real dimensions at build time (so no layout shift and no
 * hand-maintained width/height pairs) and generates the blurred placeholder
 * that covers the download. A string path gives neither, and on a site whose
 * whole job is now carried by its imagery that is the difference between a
 * page that assembles itself and one that flashes empty boxes.
 *
 * Pages never import a file directly — they name a PhotoId, which is what
 * lets `marketingNav.ts` be plain typed data instead of a module full of
 * imports, and what makes a missing photo a compile error rather than a
 * broken image in production.
 *
 * The files themselves are licence-free stock (Pexels). Swapping in the
 * clinic's own photography means replacing the file under `public/photos/`
 * at roughly the same aspect ratio; nothing here or in any page changes.
 */
export const MARKETING_PHOTOS = {
  "hero-therapy": heroTherapy,
  "hero-conditions": heroConditions,
  "hero-how-it-works": heroHowItWorks,
  "hero-team": heroTeam,
  "hero-home-visit": heroHomeVisit,
  "hero-hospitals": heroHospitals,
  "hero-faq": heroFaq,
  "mode-video": modeVideo,
  "mode-home-visit": modeHomeVisit,
  "step-book": stepBook,
  "step-assess": stepAssess,
  "step-progress": stepProgress,
  reports,
} as const satisfies Record<string, StaticImageData>;

export type PhotoId = keyof typeof MARKETING_PHOTOS;

export function photo(id: PhotoId): StaticImageData {
  return MARKETING_PHOTOS[id];
}
