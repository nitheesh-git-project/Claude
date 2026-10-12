"use client";

import type { ReactNode } from "react";
import type { TutorialRole, TutorialScene } from "@/lib/tutorial";
import {
  PatientBookScene,
  PatientFeedScene,
  PatientHealthLockedScene,
  PatientHealthReadyScene,
  PatientHealthUpdateScene,
  PatientJourneyScene,
  PatientPaymentsScene,
  PatientProfileScene,
  PatientProgrammeScene,
  PatientSuggestedScene,
} from "./patientScenes";
import {
  TherapistAvailabilityScene,
  TherapistEarningsScene,
  TherapistExamScene,
  TherapistFeedScene,
  TherapistIntakeScene,
  TherapistProfileScene,
  TherapistRecommendScene,
  TherapistSessionScene,
  TherapistTriageScene,
  TherapistUpdatesScene,
} from "./therapistScenes";
import {
  FinishScene,
  HospitalEarningsScene,
  HospitalFeedScene,
  HospitalProfileScene,
  HospitalReferScene,
  HospitalReferralsScene,
  InfoButtonScene,
  WelcomeScene,
} from "./otherScenes";

type SceneProps = { role: TutorialRole; stepId: string };

/**
 * Every scene a tutorial step can name. Typed as a `Record` over
 * `TutorialScene`, so a scene added to src/lib/tutorial.ts without one here
 * is a build error rather than a blank panel.
 */
const SCENES: Record<TutorialScene, (p: SceneProps) => ReactNode> = {
  welcome: ({ role }) => <WelcomeScene role={role} />,
  "patient-feed": () => <PatientFeedScene />,
  "patient-book": () => <PatientBookScene />,
  "patient-journey": ({ stepId }) => <PatientJourneyScene stepId={stepId} />,
  "patient-suggested": () => <PatientSuggestedScene />,
  "patient-programme": () => <PatientProgrammeScene />,
  "patient-payments": () => <PatientPaymentsScene />,
  "patient-hp-locked": () => <PatientHealthLockedScene />,
  "patient-hp-ready": () => <PatientHealthReadyScene />,
  "patient-hp-update": () => <PatientHealthUpdateScene />,
  "patient-profile": () => <PatientProfileScene />,
  "info-button": () => <InfoButtonScene />,
  "therapist-feed": () => <TherapistFeedScene />,
  "therapist-availability": () => <TherapistAvailabilityScene />,
  "therapist-session": () => <TherapistSessionScene />,
  "therapist-hp-triage": () => <TherapistTriageScene />,
  "therapist-hp-intake": () => <TherapistIntakeScene />,
  "therapist-hp-exam": () => <TherapistExamScene />,
  "therapist-hp-recommend": () => <TherapistRecommendScene />,
  "therapist-hp-updates": () => <TherapistUpdatesScene />,
  "therapist-earnings": () => <TherapistEarningsScene />,
  "therapist-profile": () => <TherapistProfileScene />,
  "hospital-feed": () => <HospitalFeedScene />,
  "hospital-refer": () => <HospitalReferScene />,
  "hospital-referrals": () => <HospitalReferralsScene />,
  "hospital-earnings": () => <HospitalEarningsScene />,
  "hospital-profile": () => <HospitalProfileScene />,
  finish: () => <FinishScene />,
};

export default function TutorialSceneView({ scene, role, stepId }: { scene: TutorialScene; role: TutorialRole; stepId: string }) {
  return <>{SCENES[scene]({ role, stepId })}</>;
}
