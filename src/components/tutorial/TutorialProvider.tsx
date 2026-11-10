"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { chapterForSection, tutorialFor, tutorialMayAutoStart, type TutorialChapter, type TutorialRole } from "@/lib/tutorial";
import TutorialStage from "./TutorialStage";

type OpenTour = { chapters: TutorialChapter[]; firstRun: boolean; single: boolean; startStep?: string };

type TutorialContextValue = {
  role: TutorialRole;
  /** Open the chapter for one dashboard section (optionally on one of its
   *  steps), or the whole tour. */
  openTour: (section?: string, step?: string) => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

/** The tutorial for this dashboard, or null outside one (the admin back
 *  office has no tutorial, so its pages render no (i)). */
export function useTutorial(): TutorialContextValue | null {
  return useContext(TutorialContext);
}

/**
 * Holds the dashboard tutorial for one role and opens it: by itself on a
 * first visit (`autoStart`), or from any (i). Mounted once per dashboard in
 * the role's layout, so the tour survives navigation between its pages and
 * every page's (i) reaches the same one.
 *
 * "Seen" is recorded when a first-run tour is finished *or* skipped -- both
 * are an answer, and a tour that came back on every visit until somebody
 * sat through all of it would be the thing people learn to hate. It is not
 * recorded from an (i), which is a replay, nor while an admin is viewing as
 * this person (`canMarkSeen` false): their visit must not use up the
 * person's own first one.
 */
export default function TutorialProvider({
  role,
  autoStart,
  canMarkSeen,
  children,
}: {
  role: TutorialRole;
  autoStart: boolean;
  canMarkSeen: boolean;
  children: ReactNode;
}) {
  const [tour, setTour] = useState<OpenTour | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!autoStart || started.current) return;
    // Never over the guided assessment's live screens.
    if (!tutorialMayAutoStart(window.location.pathname)) return;
    started.current = true;
    // A beat after the page paints, so the tour arrives over the dashboard
    // rather than in place of it.
    const id = window.setTimeout(() => {
      setTour({ chapters: tutorialFor(role), firstRun: true, single: false });
    }, 450);
    return () => window.clearTimeout(id);
  }, [autoStart, role]);

  const openTour = useCallback(
    (section?: string, step?: string) => {
      const chapter = section !== undefined ? chapterForSection(role, section) : null;
      setTour(
        chapter
          ? { chapters: [chapter], firstRun: false, single: true, startStep: step }
          : { chapters: tutorialFor(role), firstRun: false, single: false }
      );
    },
    [role]
  );

  // Read at close time without making `close` change on every open.
  const tourRef = useRef<OpenTour | null>(null);
  useEffect(() => {
    tourRef.current = tour;
  }, [tour]);

  const close = useCallback(() => {
    if (tourRef.current?.firstRun && canMarkSeen) {
      fetch("/api/dashboard/tutorial-seen", { method: "POST", keepalive: true }).catch(() => {});
    }
    setTour(null);
  }, [canMarkSeen]);

  const value = useMemo(() => ({ role, openTour }), [role, openTour]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {tour && (
          <TutorialStage
            key={tour.single ? tour.chapters[0].id : "full"}
            role={role}
            chapters={tour.chapters}
            firstRun={tour.firstRun}
            single={tour.single}
            startStep={tour.startStep}
            onClose={close}
            onOpenFull={() => setTour({ chapters: tutorialFor(role), firstRun: false, single: false })}
          />
        )}
      </AnimatePresence>
    </TutorialContext.Provider>
  );
}
