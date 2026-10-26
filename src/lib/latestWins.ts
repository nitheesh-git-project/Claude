// A small "latest wins" sender: the session cockpit tells the patient's
// screen what to show on a step open, a phase change or a clock start, and a
// therapist tapping Get ready, Go, Done in quick succession must cost one
// request for the last tap, not one per tap (the display route is rate
// limited, and a request that arrives out of order would show the patient an
// older screen). Calls are collapsed for `delayMs`; only one request is in
// flight at a time; whatever was pushed while it ran is sent after it, and
// only the newest of those.

export type LatestWins<T> = {
  /** Queue a value; the newest one is what gets sent. */
  push: (value: T) => void;
  /** Send now (a step change should not wait on the debounce). */
  flush: () => void;
  /** Drop anything not yet sent (the page is going away). */
  cancel: () => void;
};

export function createLatestWins<T>(send: (value: T) => Promise<unknown>, delayMs: number): LatestWins<T> {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  const run = () => {
    timer = null;
    if (inFlight || !pending) return;
    const { value } = pending;
    pending = null;
    inFlight = true;
    void Promise.resolve()
      .then(() => send(value))
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
        if (pending) run();
      });
  };

  return {
    push(value) {
      pending = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      run();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
