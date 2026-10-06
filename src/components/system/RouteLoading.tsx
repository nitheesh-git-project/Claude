import WordRollLoader from "@/components/system/WordRollLoader";

/**
 * What a route with a loading boundary shows while its server work is in
 * flight: the word-roll loader, centred.
 *
 * The dashboards deliberately have no loading boundary any more. Each one
 * draws its sidebar inside its own page, so a `loading.tsx` replaced the
 * sidebar along with the content on every tab tap -- the dark rail people
 * saw flash until the page arrived. They are covered by NavigationLoader
 * instead, which waits *over* the old page with the chrome left in place.
 * What is left here is the routes with no chrome to keep: the /dashboard
 * role hop, and anything else that adds a boundary later.
 */
export default function RouteLoading({
  label = "Loading…",
  fullScreen = false,
}: {
  label?: string;
  /** Fills the viewport -- for a route that has nothing on screen to keep,
   *  like the hop between "Go to Dashboard" and the dashboard itself. */
  fullScreen?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      className={`flex items-center justify-center ${fullScreen ? "min-h-screen bg-slate-50" : "min-h-[50vh] py-16"}`}
    >
      <WordRollLoader label={label} />
    </div>
  );
}
