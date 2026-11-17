// Keeps the gate's `next dev` from closing an idle connection after Node's
// default 5 seconds.
//
// Playwright's API contexts (`request.newContext`) live for a whole spec
// file and pool their sockets. A test that sends its first request on one
// shortly after the previous test used it is reusing a socket that has been
// idle for about the server's keep-alive timeout, and when the server closes
// the socket in the same instant the request goes out, the request is reset:
// `apiRequestContext.post: read ECONNRESET`, a few milliseconds in, on a
// healthy server. That is how PC-003 and SS-018 failed on three pull
// requests in a row, in specs the changes had not touched.
//
// Node closes an idle socket after keepAliveTimeout (5 s) plus a 1 s buffer,
// so the window is about 6 s after the last response -- and it only bites
// when the client's event loop is busy (a screenshot, a heavy page) across
// that moment, so the FIN has not been read when the next request goes out.
// Reproduced outside CI: a client busy for 500 ms across 6 s is reset every
// time on a stock server and never on one using this module.
//
// A server that closes later than any pause in a test cannot be raced.
// `next dev` has no flag for it (`next start` has --keepAliveTimeout), so the
// gate's preload sets it on every http server created in the process. A
// server that already chose its own value is left alone.
//
// Pure of side effects until applied, so it can be tested on its own.

/** Longer than any gap between two requests a spec makes on one context. */
export const GATE_KEEP_ALIVE_MS = 120_000;

/** What Node gives a new http.Server when nothing asked for another value. */
const NODE_DEFAULT_KEEP_ALIVE_MS = 5_000;

/**
 * Makes servers created from `httpModule` keep idle connections for `ms`.
 * Returns a function that undoes it.
 */
export function applyKeepAlive(httpModule, ms = GATE_KEEP_ALIVE_MS) {
  const proto = httpModule.Server.prototype;
  const hadOwnListen = Object.prototype.hasOwnProperty.call(proto, "listen");
  const realListen = proto.listen;
  proto.listen = function listen(...args) {
    if (this.keepAliveTimeout === NODE_DEFAULT_KEEP_ALIVE_MS) {
      this.keepAliveTimeout = ms;
      // Node asks for headersTimeout to exceed keepAliveTimeout.
      if (this.headersTimeout <= ms) this.headersTimeout = ms + 1_000;
    }
    return realListen.apply(this, args);
  };
  return () => {
    if (hadOwnListen) proto.listen = realListen;
    else delete proto.listen;
  };
}
