// Joins a realtime channel only once the socket carries the signed-in
// person's token.
//
// Postgres changes reach a channel only for rows its role may read (RLS, as
// evaluated by the realtime server against the token the JOIN carried). The
// client library builds that join the moment `subscribe()` is called, with
// whatever token it holds then, and fetches the session's token alongside
// rather than first. Three orders are possible:
//
//   token, then subscribe()        the join carries it. Fine.
//   join answered, then token      the library sends it to the joined channel,
//                                  and the server re-subscribes. Fine.
//   subscribe(), TOKEN, answer     the join went out without it; the library
//                                  notes the token, sees the channel is not
//                                  joined yet and sends nothing; and when the
//                                  answer arrives it compares the token with
//                                  the one it already noted, finds no change,
//                                  and sends nothing again.
//
// In the third order the channel reports SUBSCRIBED, the server reports
// "Subscribed to PostgreSQL" -- as `anon` -- and not one change is ever
// delivered, with nothing on screen to say so. It is a matter of
// milliseconds which order a page load takes, so it showed as a dashboard
// that sometimes never updated: reproduced against the hosted project with a
// token that resolves 0-150ms after `subscribe()` (never an event) and
// 400ms+ after (events), and it is what the quality gate's
// admin-refresh-badge spec kept failing on.
//
// So the token is settled first, always: `realtime.setAuth()` with no
// argument asks the client for the session's current token and waits for it,
// and only then is the channel made and joined. Every realtime subscription
// in the app goes through here; a `supabase.channel(...).subscribe()` written
// anywhere else brings the race back.
//
// Dependency-free on purpose (the types below are the three calls it makes),
// so the ordering is unit tested without a socket.

/** How long to wait for the session before joining anyway. A join without the
 *  token is what used to happen every time; waiting for ever would be worse. */
export const REALTIME_AUTH_WAIT_MS = 5_000;

type JoinableChannel = {
  subscribe: (callback?: (status: string, err?: Error) => void) => unknown;
};

type JoinableClient<C extends JoinableChannel> = {
  realtime: { setAuth: () => Promise<void> };
  channel: (topic: string) => C;
  removeChannel: (channel: C) => unknown;
};

/**
 * Makes `topic`, lets `configure` add its listeners, and joins it -- after the
 * socket has the session's token. Returns the cleanup for an effect: it stops
 * a join that has not started yet, and removes the channel if one was made.
 *
 * `onStatus` is never called after cleanup, so a caller needs no "disposed"
 * flag of its own for it.
 */
export function joinRealtimeChannel<C extends JoinableChannel>(
  supabase: JoinableClient<C>,
  topic: string,
  configure: (channel: C) => void,
  onStatus?: (status: string, err?: Error) => void,
  waitMs: number = REALTIME_AUTH_WAIT_MS
): () => void {
  let cancelled = false;
  let channel: C | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const join = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (cancelled || channel) return;
    channel = supabase.channel(topic);
    configure(channel);
    channel.subscribe((status, err) => {
      if (!cancelled) onStatus?.(status, err);
    });
  };

  // Whichever comes first. A session that cannot be read still joins: the
  // channel is then anonymous, which is what it would have been before.
  timer = setTimeout(join, waitMs);
  let settled: Promise<void>;
  try {
    settled = supabase.realtime.setAuth();
  } catch {
    settled = Promise.resolve();
  }
  void settled.then(join, join);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (channel) void supabase.removeChannel(channel);
  };
}
