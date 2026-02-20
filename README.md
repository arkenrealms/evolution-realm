# Realm Server for Arken: Evolution Isles

A battle for supremacy takes place amongst the dragons of Haerra.

## Setup
- Install workspace dependencies from the Arken root.
- Build: `npm run build`
- Test: `npm test`

## Current maintenance note (2026-02-19)
- Test gate is now runnable via Rush in this checkout:
  - `rushx test` executes package-local Jest tests.
- `npm test` remains environment-dependent in some checkouts, so rotation runs should prefer `rushx test` per workspace policy.

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

## Rotation note (2026-02-19T18:14:13-08:00)
- Added a focused `src/` Jest suite for `trpc-websocket.ts` and verified `rushx test` passes.
- Hardened close lifecycle behavior so both explicit `close()` calls and socket disconnect events trigger `onclose` callbacks.
