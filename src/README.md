# arken/evolution/realm/src

Focused runtime tests and implementation notes for realm source-adjacent reliability guards.

## Current focus
- `trpc-websocket.test.ts` covers close lifecycle behavior for the Socket.IO-backed WebSocket compatibility wrapper.
- The test suite verifies `onclose` callback semantics for explicit close calls, disconnect events, and both sequencing directions (`close()`+disconnect, disconnect+`close()`) with single-notification guarantees.
- `close()` is now idempotent at CLOSED/CLOSING states, preventing repeated underlying socket close attempts.
- `error` callbacks now receive an Event-like payload (`type: 'error'`) for browser-compatible handler semantics instead of a raw thrown value.
- `connect_error` callbacks now flow through the same normalized error path so initial connection failures surface consistently with post-connect socket errors.
- Reconnect cycles now reset close-notification state so each new disconnect can still notify `onclose` exactly once.
- Disconnect-originated close events now carry Socket.IO disconnect reason text for better diagnostics parity with explicit `close(code, reason)` calls.
- `send()` now enforces OPEN-state semantics: it throws while CONNECTING/CLOSED and only emits once connected.
- inbound tRPC transport frames (`'trpc'` Socket.IO event) now flow through `onmessage` alongside legacy `'message'` events so wrapper consumers receive protocol payloads consistently.
- `addEventListener()` now ignores duplicate registrations for the same event+listener pair to avoid duplicate handler execution and listener leaks.
- `removeEventListener()` now cleans up empty listener buckets after unregistering callbacks.
- Native WebSocket events (`open`, `message`, `error`, `close`) registered via `addEventListener()` are now dispatched by the wrapper itself instead of being incorrectly proxied as Socket.IO event subscriptions.
- `dispatchEvent()` now performs EventTarget-style callback routing for native handlers and listeners, enabling explicit event redispatch flows in consumers/tests.
- `onopen` now receives an Event-like payload (`type: 'open'`) on real connect events, matching WebSocket handler expectations more closely.
- Listener dispatch now isolates per-callback failures: one listener throwing no longer prevents later listeners from receiving the same event.
