/**
 * Whether the debug bar (`DebugNav`) is showing above everything.
 *
 * The app is pre-launch and has no real patients yet, so the bar is on in
 * **every** environment -- local dev, `next build` + `next start`, and the
 * deployed site alike. It used to default off whenever
 * `NODE_ENV === "production"`, which meant the one environment worth
 * checking a published change in was the one environment without the
 * "jump to page" control and the simulated clock.
 *
 * One kill switch: `NEXT_PUBLIC_SHOW_DEBUG_NAV=false`. At real launch the
 * bar should be deleted rather than switched off -- it is a public flag,
 * so anyone can read the routes it names, protected dashboards included.
 *
 * This is one function rather than the expression written out at each call
 * site because it was copied into ten of them (the root layout, three
 * dashboard shells, and six pages that hide the shared Navbar and need the
 * same top offset for their fixed sidebar), and a rule spelled ten times
 * drifts. The `process.env.NEXT_PUBLIC_...` read stays a literal so Next
 * can still inline it into the client bundles that import this.
 */
export function isDebugNavVisible(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false";
}
