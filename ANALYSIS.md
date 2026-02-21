# arken/packages/evolution/packages/realm/ANALYSIS.md

## 2026-02-18 rotation slot summary
- Loaded local markdown first (`README.md`, this file), then inspected runtime entrypoints deepest-first:
  - `shard-bridge.ts` / `shard-bridge.test.ts`
  - `trpc-websocket.ts`
  - `realm-server.ts`
  - `web-server.ts`
  - `web3.ts`
  - `index.ts`
- Focus remains runtime reliability, but no source edits were made this slot due to hard test-gate constraints.

## Test-gate results (authoritative for this run)
- `npm test -- --runInBand` ❌ `sh: jest: command not found`
- `rushx test` ❌ Rush workspace bootstrap failure: missing `@arken/cerebro-hub` package path mapping in current checkout (`.../arken/cerebro/hub/package.json`)

## Practical next step
1. Restore a runnable local test command for this package (prefer repo-defined `npm test`; align with Jest+TS direction).
2. If Rush remains required, repair workspace package path/mapping for `@arken/cerebro-hub` first.
3. Resume source-level reliability work only after tests are runnable in the same run.

## 2026-02-18 late-night slot-8 follow-up
- Re-ran branch hygiene (`git fetch origin` + merge `origin/main`) and reloaded source files deepest-first (`shard-bridge*`, `trpc-websocket.ts`, `realm-server.ts`, `web-server.ts`, `web3.ts`, `index.ts`).
- Reconfirmed test gate:
  - `npm test -- --runInBand` ❌ `jest: command not found`
  - `rushx test` ❌ Rush workspace path drift (`@arken/cerebro-hub` expected at `arken/cerebro/hub/package.json`).
- No source edits were made in this slot to preserve source-change gate compliance.

## 2026-02-18T23:43:02-08:00 slot-8 rerun
- Branch hygiene completed before analysis: `git fetch origin` + `git merge --no-edit origin/main` (already up to date).
- Reloaded local markdown first (`README.md`, `ANALYSIS.md`), then rechecked code paths deepest-first (`shard-bridge.ts/.test.ts`, `trpc-websocket.ts`, `realm-server.ts`, `web-server.ts`, `web3.ts`, `index.ts`).
- Source-change test gate remains blocked in this checkout:
  - `npm test -- --runInBand` ❌ `sh: jest: command not found`
- No source edits made in this slot to maintain gate compliance.

## 2026-02-19T01:32:23-08:00 slot-8 rerun
- Re-read local markdown first (`README.md`, `ANALYSIS.md`) before code inspection.
- Re-ran branch hygiene in direct repo branch (`git fetch origin` + `git merge --no-edit origin/main`) and confirmed clean sync.
- Revalidated source-change gate with repo-defined test command:
  - `npm test -- --runInBand` ❌ `sh: jest: command not found`
- Source remains unchanged this slot; docs updated only.
- Next actionable requirement remains restoring runnable Jest runtime for this package.

## 2026-02-19T03:32:24-08:00 slot-8 rerun
- Re-read all local markdown docs first (`README.md`, `ANALYSIS.md`) before source inspection.
- Re-ran branch hygiene (`git fetch origin` + `git merge --no-edit origin/main`) and confirmed branch is synced.
- Deepest-first code recheck for this slot:
  - `shard-bridge.test.ts` is still legacy/placeholder-heavy and references non-local modules (`../game-server`, `./app-router`), so it is not currently a realistic reliability guard.
  - `shard-bridge.ts` process-lifecycle controls remain the highest-impact runtime path for future tested hardening once Jest runtime is restored.
  - `trpc-websocket.ts` still contains compatibility wrapper scaffolding that appears lightly integrated; no edits made without runnable tests.
- Test gate result:
  - `npm test -- --runInBand` ❌ `sh: jest: command not found`.
- Source files intentionally unchanged this slot to satisfy the source-change gate.

## 2026-02-19T18:14:13-08:00 slot follow-up
- Branch hygiene performed before edits (`git fetch origin`, switched to `main`, merged `origin/main`), then created fresh branch from main.
- Added `src/trpc-websocket.test.ts` to activate and validate package-local Jest coverage under existing `testMatch`.
- Reliability hardening in `trpc-websocket.ts`:
  - explicit `close(code, reason)` now reliably calls `onclose`.
  - socket disconnect event now reliably calls `onclose`.
  - close-event construction now has a Node-safe fallback when `CloseEvent` is unavailable.
- Test result:
  - `rushx test` ✅ (1 suite, 2 tests).

## 2026-02-20 slot follow-up
- Hardened disconnect close-event parity in `trpc-websocket.ts` by forwarding Socket.IO disconnect reason text into the emitted close event.
- Why: callers already receive explicit `close(code, reason)` metadata, but disconnect-triggered closes previously dropped reason context and made diagnostics harder.
- Expanded `src/trpc-websocket.test.ts` to assert reason propagation from disconnect events.
- Test result:
  - `rushx test` ✅ (1 suite, 7 tests).

## 2026-02-20 slot follow-up (send state guard)
- Added an OPEN-state guard in `trpc-websocket.ts#send`.
- Why: pre-connect `send()` calls were being emitted while CONNECTING, which can hide race conditions and diverges from standard WebSocket invalid-state behavior.
- Added focused tests in `src/trpc-websocket.test.ts` to verify both failure and success paths.

## 2026-02-20 slot follow-up (listener dedupe + cleanup)
- Added duplicate-listener suppression in `trpc-websocket.ts#addEventListener` for the same event+callback pair.
- Why: duplicate registrations can cause repeated callback execution and noisy side effects during reconnect/rebind flows.
- Added empty-bucket cleanup in `trpc-websocket.ts#removeEventListener` after last listener removal.
- Why: keeps internal listener bookkeeping bounded and avoids stale map entries across long-lived sessions.
- Added regression tests in `src/trpc-websocket.test.ts` to validate dedupe and one-time unregister behavior.

## 2026-02-20 slot follow-up (inbound trpc parity)
- Added shared inbound message handling for both Socket.IO `'message'` and `'trpc'` events in `trpc-websocket.ts`.
- Why: outbound traffic already uses `'trpc'`; if server responses arrive on the same event, listening only to `'message'` can silently drop `onmessage` callbacks.
- Added regression coverage in `src/trpc-websocket.test.ts` to verify `'trpc'` frames are surfaced via `onmessage` without payload mutation.

## 2026-02-20 slot follow-up (late-connect reopen guard)
- Added an explicit client-close guard in the Socket.IO `connect` handler in `trpc-websocket.ts`.
- Why: if `close()` is called while still CONNECTING, a delayed transport `connect` callback could reopen the wrapper and fire `onopen` after shutdown.
- Result: `connect` is now ignored after explicit wrapper `close()` calls, while reconnect behavior after non-client disconnects remains intact.
- Added regression coverage in `src/trpc-websocket.test.ts` to ensure post-close `connect` events neither reopen state nor fire `onopen`.

## 2026-02-20 slot follow-up (native addEventListener parity)
- Fixed native WebSocket event-listener behavior for `open`, `message`, `error`, and `close` in `trpc-websocket.ts`.
- Why: listeners registered via `addEventListener('close' | 'message' | ...)` were previously forwarded to `ioSocket.on(event, ...)`, which does not represent wrapper-native lifecycle events and can drop callbacks.
- Implementation keeps custom Socket.IO event passthrough, but dispatches native listener callbacks directly from wrapper lifecycle/message/error paths.
- Added regression tests in `src/trpc-websocket.test.ts` for native close/message listeners and native close-listener removal semantics.

## 2026-02-20 slot follow-up (dispatchEvent compatibility)
- Implemented `SocketIOWebSocket.dispatchEvent(event)` so it now routes native event payloads to both property handlers (`onopen`, `onmessage`, `onerror`, `onclose`) and `addEventListener` listeners.
- Why: previous behavior returned `false` unconditionally and performed no dispatch, which broke EventTarget-style code paths that rely on explicit wrapper event redispatch (notably in tests and adapter-level lifecycle orchestration).
- Added focused regression tests in `src/trpc-websocket.test.ts` for message redispatch and invalid-event rejection semantics.

## 2026-02-20 slot follow-up (onopen event payload parity)
- Updated `SocketIOWebSocket` connect handling to pass an Event-like payload into `onopen`.
- Why: `onopen` previously fired with no arguments, diverging from WebSocket handler conventions and making event-shape-dependent callback code brittle.
- Added regression coverage in `src/trpc-websocket.test.ts` to assert connect-triggered `onopen` receives `{ type: 'open' }`.

## 2026-02-21 slot follow-up (listener dispatch isolation)
- Wrapped per-listener invocation in `dispatchListenerEvent` with try/catch in `trpc-websocket.ts`.
- Why: one throwing listener previously terminated the dispatch loop, which could silently drop downstream listener callbacks for the same event.
- Added regression coverage in `src/trpc-websocket.test.ts` proving later listeners still run and the thrown error is surfaced via logging.

## 2026-02-21 slot follow-up (post-close late-error suppression)
- Added terminal-close guards in `trpc-websocket.ts` for `error` and `connect_error` paths when the wrapper is already CLOSED via explicit client `close()`.
- Why: late transport noise after intentional shutdown should not be surfaced as actionable runtime errors to callers.
- Expanded `src/trpc-websocket.test.ts` with post-close `error`/`connect_error` assertions to lock this behavior.

## 2026-02-21 slot follow-up (message-event type parity)
- Normalized inbound payload construction in `trpc-websocket.ts` using `createMessageEvent(...)`.
- Why: wrapper callbacks previously received `{ data }` without an explicit `type`, which diverged from native `MessageEvent` shape and made event-type based listeners brittle.
- Expanded `src/trpc-websocket.test.ts` expectations to assert `type: 'message'` parity for inbound `'trpc'` frames.
