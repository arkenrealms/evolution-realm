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

## 2026-02-19T10:52:29-08:00 slot-7 active fix
- Re-read local markdown first (`README.md`, `ANALYSIS.md`) before source edits.
- Ran branch hygiene (`git fetch origin` + merge `origin/main`) and then cut fresh branch `nel/evolution-realm-websocket-error-close-20260219` from updated `main`.
- Reliability issue in current branch state: websocket wrapper never dispatched `onclose` on either `disconnect` or explicit `close()`.
- Applied practical fix in `trpc-websocket.ts`:
  - dispatch `onclose` on socket disconnect,
  - dispatch `onclose` on explicit close,
  - enforce idempotent close dispatch to avoid duplicate callbacks.
- Added `src/trpc-websocket.test.ts` with targeted Jest tests for both paths (`disconnect`, and `close()` then `disconnect`).
- Validation: `rushx test` ✅ (1 suite, 2 tests).

## 2026-02-19T12:43:23-08:00 slot-7 follow-up fix
- Re-read local markdown docs first (`README.md`, `ANALYSIS.md`), then reviewed leaf runtime/test files (`trpc-websocket.ts`, `src/trpc-websocket.test.ts`).
- Reliability issue addressed: disconnect-close events previously used a single default close payload, masking clean-vs-abnormal disconnect conditions.
- Applied practical close semantics in `trpc-websocket.ts`:
  - map `disconnect` reason `io client disconnect` to close code `1000`.
  - map other/empty disconnect reasons to close code `1006` with fallback reason `socket disconnected`.
- Added/updated Jest tests to verify both code paths and preserve close idempotency behavior.
- Validation:
  - `rushx test` ✅ (1 suite, 3 tests).
