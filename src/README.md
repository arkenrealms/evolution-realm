# arken/evolution/realm/src

Focused runtime tests and implementation notes for realm source-adjacent reliability guards.

## Current focus
- `trpc-websocket.test.ts` covers close lifecycle behavior for the Socket.IO-backed WebSocket compatibility wrapper.
- The test suite verifies `onclose` callback semantics for explicit close calls, disconnect events, and both sequencing directions (`close()`+disconnect, disconnect+`close()`) with single-notification guarantees.
- `close()` is now idempotent at CLOSED/CLOSING states, preventing repeated underlying socket close attempts.
- `error` callbacks now receive an Event-like payload (`type: 'error'`) for browser-compatible handler semantics instead of a raw thrown value.
- Reconnect cycles now reset close-notification state so each new disconnect can still notify `onclose` exactly once.
- Disconnect-originated close events now carry Socket.IO disconnect reason text for better diagnostics parity with explicit `close(code, reason)` calls.
