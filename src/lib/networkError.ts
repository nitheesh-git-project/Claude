/**
 * What a browser says when a request never reached the server.
 *
 * Every engine words it differently and none of them says anything a patient
 * can act on: Safari "Load failed", Chrome "Failed to fetch", Firefox
 * "NetworkError when attempting to fetch resource.", React Native-style
 * "Network request failed". A sign-in box that prints that text is
 * reporting a symptom as though it were a diagnosis -- the person has
 * typed a correct password and is told something broke.
 *
 * Dependency-free so the wording is unit-tested; the live listener lives in
 * `networkStatus.ts` and `components/system/OfflineBanner.tsx`.
 */

export const OFFLINE_MESSAGE =
  "No internet connection. Please connect to the internet and try again.";

const PATTERNS = [
  /^load failed$/i,
  /failed to fetch/i,
  /networkerror when attempting to fetch/i,
  /network request failed/i,
  /the internet connection appears to be offline/i,
  /the network connection was lost/i,
  /network connection (was )?lost/i,
  /err_internet_disconnected/i,
  /err_network_changed/i,
];

/** True when the text is a browser's own "the request never got out". */
export function isNetworkFailureMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const text = message.trim();
  return text.length > 0 && PATTERNS.some((p) => p.test(text));
}

/**
 * The text to show for a caught error: ours when it is a connectivity
 * failure, otherwise whatever the error said (or the fallback).
 */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (isNetworkFailureMessage(message)) return OFFLINE_MESSAGE;
  return message || fallback;
}
