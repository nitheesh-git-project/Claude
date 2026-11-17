import type { StaticImageData } from "next/image";

import authHospital from "../../public/photos/auth-hospital.jpg";
import authPatient from "../../public/photos/auth-patient.jpg";
import authPatientRegister from "../../public/photos/auth-patient-register.jpg";
import authTherapist from "../../public/photos/auth-therapist.jpg";
import authTherapistRegister from "../../public/photos/auth-therapist-register.jpg";

/**
 * The photographs beside the sign-in and register forms (the "Calm Clinic"
 * layout, AuthSplitLayout). A set of their own, chosen by the owner, and
 * kept out of marketingPhotos.ts on purpose: the marketing pages' rules
 * (every photo shows a screen and a glad face) are about explaining the
 * service to a stranger, while these sit beside a form somebody has already
 * come to fill in.
 *
 * Static imports for the same reasons as the marketing set: real dimensions
 * at build time, a generated blur placeholder, and a missing file is a
 * compile error. `position` is the focal point -- the faces, or the screen --
 * used as both `object-position` and the slow zoom's origin, so the part
 * that matters stays in frame from a phone's 4:3 strip to a desktop half
 * screen. Replacing a file at a different composition means checking it.
 */
export type AuthPhotoId =
  | "patient"
  | "patient-register"
  | "therapist"
  | "therapist-register"
  | "hospital";

export const AUTH_PHOTOS: Record<
  AuthPhotoId,
  { src: StaticImageData; alt: string; position: string }
> = {
  patient: {
    src: authPatient,
    alt: "A physiotherapist guiding a laughing patient through a shoulder stretch",
    position: "52% 28%",
  },
  "patient-register": {
    src: authPatientRegister,
    alt: "A woman on her sofa in a video session with her physiotherapist",
    position: "42% 40%",
  },
  therapist: {
    src: authTherapist,
    alt: "A physiotherapist in scrubs leading a video session with a headset",
    position: "68% 30%",
  },
  "therapist-register": {
    src: authTherapistRegister,
    alt: "A clinician in scrubs at a desk with a laptop",
    position: "50% 30%",
  },
  hospital: {
    src: authHospital,
    alt: "A clinician reviewing a foot X-ray on a tablet",
    position: "62% 45%",
  },
};
