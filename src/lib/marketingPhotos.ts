import type { StaticImageData } from "next/image";

import ctaBook from "../../public/photos/cta-book.jpg";
import ctaConditions from "../../public/photos/cta-conditions.jpg";
import ctaFaq from "../../public/photos/cta-faq.jpg";
import ctaHomeVisit from "../../public/photos/cta-home-visit.jpg";
import ctaMission from "../../public/photos/cta-mission.jpg";
import ctaStart from "../../public/photos/cta-start.jpg";
import ctaTeam from "../../public/photos/cta-team.jpg";
import careBack from "../../public/photos/care-back.jpg";
import careKnee from "../../public/photos/care-knee.jpg";
import careMobility from "../../public/photos/care-mobility.jpg";
import careNeck from "../../public/photos/care-neck.jpg";
import carePosture from "../../public/photos/care-posture.jpg";
import careSports from "../../public/photos/care-sports.jpg";
import heroConditions from "../../public/photos/hero-conditions.jpg";
import heroFaq from "../../public/photos/hero-faq.jpg";
import heroHomeVisit from "../../public/photos/hero-home-visit.jpg";
import heroHospitals from "../../public/photos/hero-hospitals.jpg";
import heroHowItWorks from "../../public/photos/hero-how-it-works.jpg";
import heroMission from "../../public/photos/hero-mission.jpg";
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
  "hero-mission": heroMission,
  "hero-team": heroTeam,
  "hero-home-visit": heroHomeVisit,
  "hero-hospitals": heroHospitals,
  "hero-faq": heroFaq,
  "mode-video": modeVideo,
  "mode-home-visit": modeHomeVisit,
  "care-back": careBack,
  "care-neck": careNeck,
  "care-knee": careKnee,
  "care-posture": carePosture,
  "care-sports": careSports,
  "care-mobility": careMobility,
  // The closing band's own set: one per page, never a photograph that page
  // already shows above. See ClosingCta.
  "cta-book": ctaBook,
  "cta-conditions": ctaConditions,
  "cta-start": ctaStart,
  "cta-home-visit": ctaHomeVisit,
  "cta-team": ctaTeam,
  "cta-mission": ctaMission,
  "cta-faq": ctaFaq,
  "step-book": stepBook,
  "step-assess": stepAssess,
  "step-progress": stepProgress,
  reports,
} as const satisfies Record<string, StaticImageData>;

export type PhotoId = keyof typeof MARKETING_PHOTOS;

export function photo(id: PhotoId): StaticImageData {
  return MARKETING_PHOTOS[id];
}
