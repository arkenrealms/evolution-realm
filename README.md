# Realm Server for Arken: Evolution Isles

A battle for supremacy takes place amongst the dragons of Haerra.

## Setup
- Install workspace dependencies from the Arken root.
- Build: `npm run build`
- Test: `npm test`

## Current maintenance note (2026-02-18)
- Source edits are currently blocked by the test gate in this checkout:
  - `npm test` fails with `jest: command not found`
  - `rushx test` fails at workspace load because `@arken/cerebro-hub` path resolution is broken in this checkout
- Until one of those test paths is restored, this package should remain docs/analysis-only in cron rotation.

## Rotation note (2026-02-18T23:43:02-08:00)
- Revalidated branch sync against `origin/main` and reran `npm test -- --runInBand`.
- Test gate is still blocked locally (`jest: command not found`), so this slot remained docs/analysis-only.

## Rotation note (2026-02-19T01:32:23-08:00)
- Branch hygiene re-run completed (`git fetch origin` + merge `origin/main` => already up to date).
- Test gate remains blocked in this checkout:
  - `npm test -- --runInBand` → `sh: jest: command not found`
- No source edits were made in this slot to preserve source-change gate compliance.

## Rotation note (2026-02-19T03:32:24-08:00)
- Branch hygiene completed (`git fetch origin` + merge `origin/main` => already up to date).
- Loaded all local markdown first, then re-reviewed leaf runtime files (`shard-bridge.test.ts`, `shard-bridge.ts`, `trpc-websocket.ts`) before parent docs.
- Source-change test gate still blocked in this checkout:
  - `npm test -- --runInBand` → `sh: jest: command not found`.
- No source edits were made in this slot to preserve test-gate compliance.

## Rotation note (2026-02-19T10:52:29-08:00)
- Branch hygiene completed (`git fetch origin` + merge `origin/main`), then continued on a fresh branch from latest main.
- Hardened websocket close-hook behavior in `trpc-websocket.ts`:
  - `disconnect` now dispatches `onclose`.
  - explicit `close()` dispatches `onclose`.
  - duplicate close notifications are prevented when `close()` is followed by `disconnect`.
- Added Jest regression coverage in `src/trpc-websocket.test.ts` for both close paths.
- Validation command: `rushx test`.

## Rotation note (2026-02-19T12:43:23-08:00)
- Branch hygiene completed (`git fetch origin` + merge `origin/main` => already up to date).
- Improved websocket close reliability in `trpc-websocket.ts` by mapping Socket.IO disconnect reasons to WebSocket-style close codes:
  - `io client disconnect` => clean close code `1000`.
  - unknown/other disconnect reasons => abnormal close code `1006` with fallback reason text.
- Expanded regression coverage in `src/trpc-websocket.test.ts` for both close-code paths.
- Validation command: `rushx test`.

## Rotation note (2026-02-19T14:32:58-08:00)
- Branch hygiene completed (`git fetch origin` + merge `origin/main` => already up to date).
- Tightened websocket close semantics in `trpc-websocket.ts` so `CloseEvent.wasClean` now reflects the close code (`true` for `1000`, `false` for abnormal close codes).
- Extended regression assertions in `src/trpc-websocket.test.ts` to validate `wasClean` for both disconnect paths.
- Validation command: `rushx test`.
