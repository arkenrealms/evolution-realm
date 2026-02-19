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
