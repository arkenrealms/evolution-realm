# arken/evolution/realm/src/ANALYSIS.md

## 2026-02-19
- Added `trpc-websocket.test.ts` to provide the first package-local Jest suite matched by `jest.config.js` (`**/src/**/*.test.ts`).
- This suite protects a practical reliability path: close callback delivery from `trpc-websocket.ts`.
- Guarded against Node runtime variance by allowing close-event fallback objects when `CloseEvent` is unavailable.
- Added a duplicate-close notification guard to `trpc-websocket.ts` so explicit `close()` and subsequent Socket.IO `disconnect` do not fire `onclose` twice.
- Added regression coverage for `close() -> disconnect` ordering to lock in single-notification behavior.
- Added complementary regression coverage for `disconnect -> close()` ordering and repeated `close()` calls.
- Hardened `close()` with a CLOSED/CLOSING guard so repeated close attempts become no-ops instead of re-closing the underlying socket.
- Normalized socket `error` callback delivery through an Event-like wrapper so `onerror` consumers always receive a WebSocket-style event object (`type: 'error'`) even in Node runtimes.
- Added regression coverage asserting `onerror` receives the normalized Event-like payload.
- Reset close-notification guard state on reconnect (`connect`) so later disconnects still emit `onclose`; this prevents stale suppression after a prior close cycle.
- Added regression coverage for disconnect → reconnect → disconnect to verify two distinct `onclose` notifications across connection lifecycles.
- Forwarded Socket.IO disconnect reason strings into the synthetic close event (`reason`) so disconnect-driven closes preserve actionable context.
- Added regression coverage asserting disconnect reasons are propagated to `onclose` payloads.
- Added a send-state guard in `trpc-websocket.ts` to throw when `send()` is called before the wrapper is OPEN; this prevents silent pre-connect emits and aligns behavior with WebSocket invalid-state expectations.
- Added regression coverage for both send paths: (a) throw + no emit while CONNECTING, (b) successful `trpc` emit after simulated `connect`.
- Added duplicate-listener registration guard in `addEventListener()` so repeated registrations of the same callback on the same event no longer stack duplicate socket handlers.
- Added cleanup in `removeEventListener()` to clear empty event buckets after unregistering listeners, preventing stale listener-map growth.
- Added regression tests confirming duplicate registration suppression and one-time unregister behavior per distinct listener.
- Added explicit `connect_error` forwarding into the same normalized `onerror` path used by runtime `error` events.
- Why: connection-establishment failures previously had no wrapper-level delivery path, creating a blind spot where early transport/auth errors were swallowed by the compatibility layer.
- Added regression coverage asserting `connect_error` events produce Event-like `onerror` payloads.
