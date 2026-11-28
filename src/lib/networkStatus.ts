/**
 * One shared answer to "can this browser reach the internet right now?".
 *
 * `navigator.onLine` alone is not enough: it reads true on a Wi-Fi network
 * with no uplink, which is the common failure. So a request that dies with
 * a browser network error also marks the connection down, and any request
 * that comes back (or the browser's `online` event) marks it up again.
 * Client-only: every function is a no-op on the server.
 */
import { isNetworkFailureMessage, OFFLINE_MESSAGE } from "./networkError";

const listeners = new Set<() => void>();
let failed = false;
let installed = false;

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeNetwork(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while the browser says offline or a request has just failed to get out. */
export function isOfflineNow(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false || failed;
}

function setFailed(next: boolean) {
  if (failed === next) return;
  failed = next;
  emit();
}

/**
 * Wraps window.fetch once. A rejected request whose error is the browser's
 * generic network text gets our wording in place (same TypeError, so any
 * `instanceof` check still holds) and flips the status; a resolved request
 * clears it. Never changes a response, never swallows an error.
 */
export function installNetworkGuard(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;
  const original = window.fetch.bind(window);
  const guarded: typeof window.fetch = async (...args) => {
    try {
      const res = await original(...args);
      setFailed(false);
      return res;
    } catch (err) {
      if (err instanceof TypeError && isNetworkFailureMessage(err.message)) {
        setFailed(true);
        err.message = OFFLINE_MESSAGE;
      }
      throw err;
    }
  };
  window.fetch = guarded;
  const onOnline = () => {
    failed = false;
    emit();
  };
  const onOffline = () => emit();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    if (window.fetch === guarded) window.fetch = original;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    installed = false;
  };
}
