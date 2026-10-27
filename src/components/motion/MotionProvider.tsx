"use client";

import { MotionConfig } from "motion/react";

/**
 * Honours the visitor's reduced-motion setting for every `motion` element
 * under it. `reducedMotion="user"` keeps opacity changes but drops transforms
 * and layout travel, so a person who asked for less movement is not sent
 * sliding cards and springing buttons by components that never thought to ask.
 * (The splash and the scroll-reveal also check the media query themselves;
 * this is the net under the ones that do not.) A client component only
 * because the root layout is a Server Component and MotionConfig is a
 * provider.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
