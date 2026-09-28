/**
 * Whether the debug bar (`DebugNav`) is showing above everything.
 *
 * The debug navigation is deliberately disabled in every build. It exposes
 * internal routes and a destructive reset control, so a public environment
 * must never be able to enable it through a browser-visible variable.
 *
 * Dashboard shells share this helper to keep their fixed navigation aligned
 * with the root layout. Keeping the helper while it returns a constant means
 * that the corresponding offset disappears consistently everywhere.
 */
export function isDebugNavVisible(): boolean {
  return false;
}
