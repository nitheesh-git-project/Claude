"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Shares the current page's list of section ids between the left-hand
 * SectionNav rail (which owns the list, since it comes from the page's own
 * server render) and the bottom-right ScrollHint arrow (which lives in the
 * root layout and has no way to know what the page below it contains).
 *
 * A context rather than a DOM query or a per-page constant: the home page's
 * nav items are conditional on admin-controlled data, so the list only
 * exists at render time, and both consumers must agree on it or the arrow
 * would skip a section the rail shows.
 */
const SectionIdsContext = createContext<string[]>([]);
const RegisterContext = createContext<(ids: string[]) => void>(() => {});

export function SectionNavProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  // Children are an already-rendered server tree passed as a prop, so a
  // registration re-render here re-renders the provider only, not the page.
  const register = useMemo(() => setIds, []);
  return (
    <RegisterContext.Provider value={register}>
      <SectionIdsContext.Provider value={ids}>{children}</SectionIdsContext.Provider>
    </RegisterContext.Provider>
  );
}

export function useSectionIds(): string[] {
  return useContext(SectionIdsContext);
}

/** Publishes this page's section ids for the duration of the page's life. */
export function useRegisterSectionIds(ids: string[]) {
  const register = useContext(RegisterContext);
  // Keyed on the joined ids rather than the array itself -- the caller
  // rebuilds the array on every render, so an identity dep would re-register
  // forever.
  const key = ids.join("|");
  useEffect(() => {
    const list = key === "" ? [] : key.split("|");
    register(list);
    return () => register([]);
  }, [key, register]);
}
