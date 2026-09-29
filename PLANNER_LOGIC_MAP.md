# ABH Production Planner — Logic Map

Single-source-of-truth registry for every core calculation.  
**Before adding any new calculation touching stock, demand, capacity, or cover: check this file first.**

---

## How to use this file

1. Search for your calculation topic here.
2. Find the canonical function or constant.
3. Call it — do not write a new implementation.
4. If your use case genuinely cannot call the canonical function (e.g. a hot-path loop that planWeek's memoisation does not cover), add a new row to the **Known Justified Duplications** table before committing, explaining why.
5. Run `npm test` — the LM tripwire tests will fail if you exceed the documented duplicate counts.

---

## Tier 1 — Config Constants

These are the ONLY places where these values may be defined.
All consumers must reference the constant, never a hardcoded number.

| ID | Constant | Line | Value | Controls |
|----|----------|------|-------|----------|
| C-01 | `STOCK_COVER` | 717 | `{target:5, floor:3}` — UI-editable | Every cover-days threshold and floor-breach alert |
| C-03 | `BUDGET_DATA_UPDATED` | 683 | `'2026-08-26'` | Budget staleness badge (amber at >= 90 days) |
| C-04 | `UPP` | 702 | `{10L:96, 5L:60, 2L:64, 12pk:126, 6pk:252}` | All unit-to-pallet conversions. **Metcash-specific:** Metcash sends individual consumer units. `parseMetcashWB` applies an intermediate shipper conversion (`_mcShip`: 5L/3, 2L/6) before dividing by UPP, giving effective Metcash divisors of 10L÷96, 5L÷180, 2L÷384. Confirmed correct by Jeremy Wheeler 17/08/2026. |
| C-05 | `SKUS` | 703 | `['10L Cask','5L Cask','2L Bottle','600ml 6pk']` | Canonical SKU list; loop order matters. **600ml 12pk excluded from SKUS 27/08/2026 — not material to the plan. Occasional Amazon runs handled outside the planner. Constants (UPP, STOCK_PAL etc.) retain 12pk keys intentionally.** |
| C-06 | `ALL_WEEKS` | 685 | IIFE — rolling 18-month horizon from 2026-03-16 | Week selector and all time-indexed lookups |
| C-07 | `OPEN_ORDER_PRICE` | 3234 | `{10L:13.08, 5L:6.70, ...}` | Open-order amount fallback when quantity is missing |

---

## Tier 2 — Canonical Calculation Functions

These are the ONE authoritative source for each calculation.

### Stock and inventory

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-01 | `availPal()` | 729 | `{sku: pal}` | Opening available stock = `stockPal[s] - onHoldPal[s]`. Used by `planWeek`, rolling table, stock detail. **Never recompute this inline.** |

### Demand pipeline

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-02 | `getDemand(week)` | 1010 | `{sku: {ww,coles,metcash,other,total}}` | Raw merged demand from COMBINED + otherDemand. All demand reads start here. |
| F-03 | `getAdjustedDemand(week)` | 1032 | Same shape | Mid-week demand scaling (Mon 5/5 … Wed 3/5, Thu+ zeroed). Called by `planWeek` for current-week demand only. |

### Date and calendar

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-04 | `monOf(dateStr)` | ~779 | `YYYY-MM-DD` Monday | Normalising any date to its week Monday |
| F-05 | `addDays(dateStr, n)` | ~778 | `YYYY-MM-DD` | Date arithmetic throughout |
| F-06 | `localToday()` | ~838 | `YYYY-MM-DD` in AEST | Today's date — never use `new Date().toISOString()` |
| F-07 | `workingDaysInWeek(weekStart)` | ~782 | `[YYYY-MM-DD, ...]` | Operating days after removing public holidays and planned shutdowns |
| F-08 | `opDaysInWeek(weekStart)` | ~791 | count (integer) | Shorthand count of working days |
| F-09 | `remainingOpDaysInWeek(weekStart)` | ~796 | count | Remaining working days from today in the current week |

### Production scheduling

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-10 | `scheduleEPCaskLines(...)` | 1083 | `{days10, days5, shifts[], ...}` | Day-by-day allocation of EP Line A&B across 10L/5L Cask. Do not call from render functions — call via `planWeek` only. |
| F-11 | `scheduleBottleLine(...)` | 1174 | `{shifts[], endStock2L, endStock12, endStock6, ...}` | EP New Line (bottle) scheduling. Same constraint: route through `planWeek`. |
| F-12 | `planWeek(week)` | 1467 | `{avail, plannedProd, stockEnd, coverDays, satUsed, totalNet, ...}` | **Master integration function.** Calls F-10 and F-11, rolls stock forward, returns complete weekly plan. All render functions consume this result — never re-derive avail/cover/capacity independently. |
| F-13 | `forwardSimulate(fromWeekIdx, openStock, eff)` | 1416 | `{deficits}` | Multi-week capacity deficit projection loop (used internally by planWeek). Not called from render functions. |

### Alerts and display

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-14 | `buildAllAlerts()` | 3720 | void (writes to DOM) | All alert generation — cover breach, trajectory, night shift, Saturday triggers. |
| F-15 | `getMaxPal(schedEntry)` | 3416 | base pallets/shift | Display-only: maps a schedule entry to its line capacity denominator. Not used in planning calculations. |
| F-16 | `buildSchedule(week, pr)` | 2798 | `[{day,shift,sku,pallets,...}]` | Converts planWeek result into renderable shift rows. |

### Data rebuild

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-17 | `rebuildData()` | 5908 | void | Merges uploaded forecasts (WW/Coles/Metcash) into COMBINED. Called after every file parse. |
| F-18 | `forwardFillDemand()` | 5817 | void | Projects known demand forward past each retailer's live horizon. Called by `rebuildData`. Part-week guard (01/08/2026): if the last live week is partial (fewer than 5 delivery days OR lastFcstDate before Friday of that week), steps back to the previous full week as the roll-forward base. Partial week data stays in COMBINED unchanged. |

---

## Tier 3 — Known Justified Duplications

These patterns appear in multiple locations. Each occurrence is intentional and documented.
**The `npm test` LM tripwire enforces that the count does not increase.**
If a rate changes, every location in this table must be updated.

| Pattern | Count | Locations | Why duplicated | Risk on rate change |
|---------|-------|-----------|----------------|---------------------|
| `? 90 : 45` / `? 45 : 90` (HMPS pal/shift) | 7 | `forwardSimulate` (1431), `planWeek` main (1474), `planWeek` per-day loop (1703 — form: `mode==='single' ? 45 : 90`), `planWeek` Saturday block (1988), `renderRollingTable` (3121), `buildAllAlerts` (3921), `buildSchedule` (2860 — form: `mode==='single' ? 45 : 90`) | Each function runs in a separate context. planWeek has 3 sub-expressions across its weekly, per-day, and Saturday paths. buildSchedule and planWeek per-day loop use inverted condition form (`mode === 'single'`) that evades the standard tripwire regex. | All 7 locations need updating if HMPS throughput changes |
| `(lineAOnly ? 40 : 80)` (EP 10L base/shift) | 3 | `scheduleEPCaskLines` (~1090), `forwardSimulate` (~1449), `planWeek` (~1503) | forwardSimulate and planWeek pre-compute needed days before calling the authoritative scheduler | All 3 locations. **Rates updated 14/09/2026 (Rob Harris) from old `? 30 : 60`.** |
| `(lineAOnly ? 30 : 59)` (EP 5L base/shift) | 4 | `scheduleEPCaskLines` (~1091), `forwardSimulate` (~1450), `planWeek` (~1504), `planWeek` Saturday block (~1638) | Same as above, plus Saturday scheduling in planWeek bypasses scheduleEPCaskLines for single-shift logic | All 4 locations. **Rates updated 14/09/2026 (Rob Harris) from old `? 27 : 50`.** |
| `tgt=52` / `tgt:52` (Bottle 2L base/shift) | 3+ | `getMaxPal` (3416), `planWeek` stub (~1503), `planWeek` Saturday block (~1638) | getMaxPal is display-only; planWeek stub is legacy compatibility for renderProdTable | getMaxPal + planWeek both need updating |
| EP New Line rates (6pk:32) | 2+ | `getMaxPal` (~3417), `planWeek` Saturday block (~1639) | Same as 2L above. **12pk removed from scheduling logic 27/08/2026 — occasional Amazon runs handled outside the planner.** | Both locations |

---

## What the tripwire tests catch vs. what they miss

The `LM: Logic Map tripwires` block in the test suite checks:

**Caught:**
- A new copy of any Tier 3 pattern (count exceeds the documented number → test fails)
- Removal of any canonical function (test fails if function is renamed or deleted)
- Re-introduction of the `availPal` inline formula (`stockPal[s]-onHoldPal[s]`) anywhere outside the `availPal` definition
- ALL_WEEKS reverting to a static array

**NOT caught (known gap):**
- A new calculation using *different variable names* for the same logic (e.g. `myRate = hmpsConfig === 'Dual' ? 80 : 40` — different numbers, evades the pattern check)
- Structural duplication in a new function that doesn't match any existing pattern
- Correct formula but wrong source variable (e.g. reading `stockPal` directly instead of calling `availPal()`)

The tripwire is a first-line catch, not a proof of correctness. Code review remains the backstop.

---

## FY year derivation (H1)

The ABH FY ends 30 June. The FY year number equals the calendar year in which the FY ends.

**Canonical inline formula** (appears in `renderBudget`, line ~5799):
```javascript
const _fyYear = _fyMM >= 7 ? _fyYYYY + 1 : _fyYYYY;
```

Do not hardcode a year. Do not add a separate constant for this — the formula is trivial and the context (year and month) is always locally available.

---

*Last updated: 29/09/2026 — line numbers refreshed, EP cask rates updated to post-14/09/2026 values, buildSchedule added as 5th HMPS location (D-01, D-02, D-03 from 29/09/2026 diagnostic).*
