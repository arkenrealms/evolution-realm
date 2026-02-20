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
