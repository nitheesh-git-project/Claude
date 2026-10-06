"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * One count of "the app is doing something the person is waiting for".
 *
 * Every mutating button in this app already had a local `loading` flag, and
 * that flag was the problem rather than the fix: the pattern was
 * `setLoading(false); router.refresh();`, so the button went back to looking
 * idle and *then* the expensive half started. On the admin dashboard a
 * refresh re-runs the whole Server Component -- ~49 queries and every screen
 * -- with nothing on screen saying so, which is exactly the "it froze"
 * report. A per-button flag cannot cover that: the work outlives the button,
 * and on a navigation the button is unmounted before the new page arrives.
 *
 * So the signal is global and counted rather than boolean: two overlapping
 * actions must not have the first one to finish switch the indicator off.
 */
type PendingWorkValue = {
  pending: boolean;
  /** Whether part of that work is a move to another page -- the one kind the
   *  full loader (NavigationLoader) answers. A refresh after a button press
   *  only gets the teal bar: the page is staying where it is. */
  navigating: boolean;
  /** Marks work as started; the returned function marks it finished. Safe to
   *  call twice -- the second call is ignored, so a `finally` that runs after
   *  an early return cannot drive the count negative. Pass "navigation" when
   *  the work is going to another page. */
  begin: (kind?: WorkKind) => () => void;
};

export type WorkKind = "work" | "navigation";

const PendingWorkContext = createContext<PendingWorkValue | null>(null);

export function PendingWorkProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const [navCount, setNavCount] = useState(0);
  const navCountRef = useRef(0);

  const begin = useCallback((kind: WorkKind = "work") => {
    countRef.current += 1;
    setCount(countRef.current);
    if (kind === "navigation") {
      navCountRef.current += 1;
      setNavCount(navCountRef.current);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      countRef.current = Math.max(0, countRef.current - 1);
      setCount(countRef.current);
      if (kind === "navigation") {
        navCountRef.current = Math.max(0, navCountRef.current - 1);
        setNavCount(navCountRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ pending: count > 0, navigating: navCount > 0, begin }),
    [count, navCount, begin]
  );

  return (
    <PendingWorkContext.Provider value={value}>{children}</PendingWorkContext.Provider>
  );
}

/**
 * Reports work in progress to the global indicator.
 *
 * Returns a no-op outside the provider rather than throwing: these hooks are
 * called from components that also render in tests and in isolated stories,
 * and a missing progress bar must never be the reason a booking button stops
 * working.
 */
export function usePendingWork(): PendingWorkValue {
  return (
    useContext(PendingWorkContext) ?? {
      pending: false,
      navigating: false,
      begin: () => () => {},
    }
  );
}
