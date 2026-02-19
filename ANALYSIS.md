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
