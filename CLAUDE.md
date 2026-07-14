# ABH Production Planner — Project Rules

## Scope
Single-file HTML/JS planner at planner.abhgroup.com.au.
Supabase project: yxaebxkkclbjezffmerw.
GitHub: rharris008/abh-production-planner (main branch = live).
Push to main is GREEN (Rob confirmed 09/07/2026 — no confirmation needed).

## Regression Test Suite — MANDATORY

**Run before every commit that touches planning logic in index.html:**

```
npm test
```

Suite: `tests/planner-regression.test.mjs`
Framework: Node built-in `node:test` (no install needed, Node 18+).
Coverage: 55 tests across 8 suites (C2, H1, H2, H3, H4, H5, M6, LM).

**A failing test blocks the commit.** Fix the root cause — do not modify the test
to pass around a broken implementation.

### What the tests lock in
Each test maps to a finding from the 11/07/2026 diagnostic audit:

| Finding | What it guards |
|---------|---------------|
| H1 | FY year derived dynamically (not hardcoded 2027) |
| H2 | BUDGET_DATA_UPDATED badge fires amber at 90 days |
| C2 | STOCK_COVER={target:5,floor:3} is sole threshold authority |
| H3 | renderReplan reads pr.plannedProd — no independent capPerDay formula |
| H4 | renderStockTable avail/cover from planWeek — no OO double-count |
| H5 | parseActuals has no monkey-patch; sbPushUpsert('actuals') in body |
| M6 | Dead functions removed; OPEN_ORDER_PRICE single definition |

### When to run
- Before any commit touching `planWeek()`, `renderStockTable()`, `renderReplan()`,
  `parseActuals()`, `buildAllAlerts()`, `getAdjustedDemand()`, `renderOCGrid()`,
  `renderBudget()`, or any constant they depend on (STOCK_COVER, BUDGET_DATA_UPDATED,
  OPEN_ORDER_PRICE, FORWARD_LOOK_WEEKS).
- Before any commit adding new planning logic that touches the same code paths.
- After any refactor, even if only renaming or restructuring.

### Adding new tests
When a new bug is found and fixed, add a regression test before closing the finding.
Name format: `FINDING_ID — description` (matching the pattern already in the suite).

## Logic Map — MANDATORY before adding any calculation

**`PLANNER_LOGIC_MAP.md`** is the single-source-of-truth registry for every core
calculation in this planner. Read it before touching any code involving:

- Stock levels, cover days, or floor/target thresholds
- Demand (raw, adjusted, or forward-filled)
- Production capacity (HMPS, EP cask lines, bottle line)
- Available stock or stock-minus-on-hold
- Week/date arithmetic

### Pre-change checklist — calculations

Before writing ANY new calculation touching stock, demand, capacity, or cover:

1. **Check the registry first.** Search `PLANNER_LOGIC_MAP.md` for the topic.
2. If a canonical function exists: **call it, don't clone it.**
3. If you genuinely cannot call it (e.g. a separate projection loop where planWeek
   memoisation doesn't apply): add a row to the *Known Justified Duplications* table
   in `PLANNER_LOGIC_MAP.md` BEFORE committing, explaining why.
4. Do not write a new inline implementation of any Tier 1 constant or Tier 2 function
   without Rob's explicit confirmation first. This is the same confirm-first pattern
   used for RED actions — a duplicate calculation that silently diverges is as
   damaging as an incorrect external send.
5. Run `npm test`. The LM tripwire tests will fail if the duplicate count for any
   registered pattern increases beyond its documented baseline.

This rule exists because the 11/07/2026 audit found the same drift pattern three
times (C2: cover thresholds, H3: capacity formula, H4: stock-minus-OO logic) — each
as multiple independent implementations that silently disagreed. The registry and
tripwires are the structural barrier against a fourth recurrence.

## ABH Planner scope

This planner covers Pureau SKUs only:
- 10L Cask, 5L Cask, 2L Bottle, 600ml 12pk, 600ml 6pk

Ignore: Lemon Fresh, Daily Good, any third-party SKUs.

## HMPS targets (current)

- Operational target: 67 pal/shift at 75% utilisation.
- 2-shift day: 134 pal/day.
- 3-shift (201/day) DELAYED to 01/09/2026 per Rob 28/06/2026.
- Do not use 60/shift or 120/day.
