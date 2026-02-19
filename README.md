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
