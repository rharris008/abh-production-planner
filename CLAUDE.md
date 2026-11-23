# ABH Production Planner — Project Rules

## Scope
Single-file HTML/JS planner at rharris008.github.io/abh-production-planner/.
Supabase project: yxaebxkkclbjezffmerw.
GitHub: rharris008/abh-production-planner (main branch = live).
Push to main is GREEN (Rob confirmed 09/07/2026 — no confirmation needed).

## Code Editing Protocol — MANDATORY (added 15/10/2026)

Three consecutive commits broke the planner with TDZ (Temporal Dead Zone) crashes.
All three passed syntax checks and all source-grep tests. Root cause: editing a 4,000-
line file from memory without reading local context first.

**Before inserting any code that references an existing variable:**

1. **Read 20 lines around the insertion point** — not just the target line. Find the
   exact line number of every variable you reference. A `const` in a 400-line function
   can be anywhere. "I know it's above" is not enough.

2. **Check declaration order before committing:**
   ```
   python3 -c "
   js = open('index.html').read()
   print(js.find('const VARIABLE_YOU_REFERENCE'))
   print(js.find('const VARIABLE_YOU_ARE_ADDING'))
   "
   ```
   The reference must print a LOWER number than the addition. If not, move the code.

3. **Run npm test before git add** — not after. The RT1 suite executes scheduler
   functions at runtime and will catch TDZ crashes the source-grep tests cannot.

## Regression Test Suite — MANDATORY

**Run before every commit that touches planning logic in index.html:**

```
npm test
```

Suite: `tests/planner-regression.test.mjs`
Framework: Node built-in `node:test` (no install needed, Node 18+).
Coverage: 90 tests across 14 suites (C2, H1, H2, H3, H4, H5, M6, LM, R1, CS1, CS2, RT1, SM1, SM2, NS1).

**A failing test blocks the commit.** Fix the root cause — do not modify the test
to pass around a broken implementation.

### What the tests lock in
Each test maps to a finding from the 11/07/2026 diagnostic audit:

| Finding | What it guards |
|---------|---------------|
| H1 | FY year derived dynamically (not hardcoded 2027) |
| H2 | BUDGET_DATA_UPDATED badge fires amber at 365 days |
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

**Keep the map current:** Any commit that changes a Tier 1 constant value, moves a Tier 2 function, or adds/removes a Tier 3 pattern location must update `PLANNER_LOGIC_MAP.md` in the same commit. The map and the code must always agree. A stale map is as harmful as no map.

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

## Tracker Tab Component Standard (corrected per Rob email 16/09/2026)

All tracker/register tabs (HACCP, Maintenance register-style, any future action register) must use the same visual pattern as the 3-Year Plan tracker tabs. Do NOT invent new card/grid layouts for tracker tabs. Do NOT use the planner's soft-pastel badge classes (`.bg`, `.ba`, `.bb`, `.br`) for tracker tab tables — those are used in the planning grid only.

**Required structure:**
1. `<div class="ph navy">Tab Title</div>` header
2. `<div class="tracker-stats">` KPI-style stat tiles: `.stat-tile` + `.stat-tile-label` + `.stat-tile-value` — these now render with 32px bold value, box-shadow, and hover lift (matching 3-Year Plan kpi-tile)
3. `<div class="tscroll"><table>` — the global `th` rule already applies navy headers; no extra class needed
4. Badges for tracker tables: use `.badge` + one of the solid-fill tracker classes:
   - `.badge-complete` (green solid, white text) — COMPLETE status
   - `.badge-progress` (blue solid, white text) — IN PROGRESS status
   - `.badge-todo` (grey, dark text) — TO DO status and NORMAL priority
   - `.badge-urgent` or `.badge-overdue` (red solid, white text) — URGENT priority or overdue date
   - `.badge-high` (amber solid, white text) — HIGH priority

**Why:** Rob's email 16/09/2026 flagged that the first build used soft pastel badges and compact stat tiles, which do not match the 3-Year Plan look and feel. The solid-fill badge classes and KPI-tile stat tiles are the correct implementation.

This standard lives here (project CLAUDE.md) AND is referenced in the global ABH_Brand_Pack.md. Read this before building any new tracker tab.

## HMPS targets (current)

- Operational target: 67 pal/shift at 75% utilisation.
- 2-shift day: 134 pal/day.
- 3-shift (201/day) — **NOW ACTIVE.** `hmpsNightShift = true` set by Rob 25/10/2026. Runs permanently until Rob explicitly disables. All capacity calculations now use 3 shifts for HMPS.
- Do not use 60/shift or 120/day.

## Production Plan Lock Rule

Once Aaron's production plan email is applied to `CONFIRMED_SCHEDULES`, the week is immediately locked in Supabase `locked_weeks`. No code fix, algorithm, re-seed, or Nike-initiated change may overwrite a locked week. Aaron and Jeremy can always change a locked week — the lock only blocks automated/algorithm changes.

- `plan_change_applier.py` does NOT block authorised senders on locked weeks. Aaron's emails apply immediately and re-lock the week.
- Aaron's email IS the lock instruction — no button, no separate confirmation.
- To unlock: Rob deletes the row from `locked_weeks` in Supabase. Only Rob can unlock.
- When writing any parser fix or code change that touches `CONFIRMED_SCHEDULES` data rows for a specific week, check `locked_weeks` first.
- Supabase table: `locked_weeks` (week_start DATE PK, locked_at TIMESTAMPTZ, locked_by TEXT) — project yxaebxkkclbjezffmerw.

Rob, 18/09/2026: "once Aaron locks it, it is locked — there is no algorithm override — that has been a rule for months."

## Planner is Single Source of Truth

The planner at rharris008.github.io/abh-production-planner is THE single source of truth for all production schedules. Any script reading the production schedule must use the live planner, not rebuild from raw Supabase data.

- Use `get_planner_schedule_live()` in `aaron_production_thursday.py` — Playwright renders the live JS runtime.
- Fallback chain (Playwright fails): CONFIRMED_SCHEDULES then Supabase production_plan_daily.
- Do NOT re-implement the planner algorithm in Python. It depends on live NS stock and a complex multi-source algorithm.
- Do NOT read Supabase `production_plan_daily` alone — gets stale data, misses mid-week SKU switches.

Rob, 01/10/2026: "you should not be trying to re build the output for the email — the planner is the single source of the truth."

## W12 Anchor Carry-Back Rule

Any correction to `W12_ANCHOR` values in a one-off build script MUST also be applied to `ABH_ProdVsSales_CC_Prompt_v4.md` in the same session.

- Correct NS date: dateTo=2026-03-20 (W12 Friday close). NOT March 21 (Saturday = W13 start).
- Run NS Report 752 with subsidiaryId=2 at dateTo=2026-03-20 to re-verify any anchor value.
- SOH comparison must query NS at fri.isoformat() (W{current} Friday close), NOT today.isoformat().

Why: 18/10/2026, W12 anchors corrected in build script but CC prompt not updated. W43 built with wrong anchors, causing 84% reported SOH variance.
