# arken/evolution/realm/src

Focused runtime tests and implementation notes for realm source-adjacent reliability guards.

## Current focus
- `trpc-websocket.test.ts` covers close lifecycle behavior for the Socket.IO-backed WebSocket compatibility wrapper.
- The test suite verifies `onclose` callback semantics for explicit close calls, disconnect events, and `close()`+disconnect sequencing (single notification).
