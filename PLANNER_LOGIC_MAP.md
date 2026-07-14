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
| C-01 | `STOCK_COVER` | 539 | `{target:5, floor:3}` — UI-editable | Every cover-days threshold and floor-breach alert |
| C-02 | `LAST_12PK_PROD_WEEK` | 530 | `'2026-08-31'` | 12pk demand close-out and production cutoff |
| C-03 | `BUDGET_DATA_UPDATED` | 500 | `'2026-06-22'` | Budget staleness badge (amber at >= 90 days) |
| C-04 | `UPP` | 519 | `{10L:96, 5L:60, 2L:64, 12pk:126, 6pk:252}` | All unit-to-pallet conversions |
| C-05 | `SKUS` | 520 | `['10L Cask','5L Cask','2L Bottle','600ml 12pk','600ml 6pk']` | Canonical SKU list; loop order matters |
| C-06 | `ALL_WEEKS` | 502 | IIFE — rolling 18-month horizon from 2026-03-16 | Week selector and all time-indexed lookups |
| C-07 | `OPEN_ORDER_PRICE` | 3234 | `{10L:13.08, 5L:6.70, ...}` | Open-order amount fallback when quantity is missing |

---

## Tier 2 — Canonical Calculation Functions

These are the ONE authoritative source for each calculation.

### Stock and inventory

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-01 | `availPal()` | 550 | `{sku: pal}` | Opening available stock = `stockPal[s] - onHoldPal[s]`. Used by `planWeek`, rolling table, stock detail. **Never recompute this inline.** |

### Demand pipeline

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-02 | `getDemand(week)` | 667 | `{sku: {ww,coles,metcash,other,total}}` | Raw merged demand from COMBINED + otherDemand. All demand reads start here. |
| F-03 | `getAdjustedDemand(week)` | 693 | Same shape | Mid-week demand scaling (Mon 5/5 … Wed 3/5, Thu+ zeroed). Called by `planWeek` for current-week demand only. |

### Date and calendar

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-04 | `monOf(dateStr)` | 600 | `YYYY-MM-DD` Monday | Normalising any date to its week Monday |
| F-05 | `addDays(dateStr, n)` | 599 | `YYYY-MM-DD` | Date arithmetic throughout |
| F-06 | `localToday()` | 658 | `YYYY-MM-DD` in AEST | Today's date — never use `new Date().toISOString()` |
| F-07 | `workingDaysInWeek(weekStart)` | 603 | `[YYYY-MM-DD, ...]` | Operating days after removing public holidays and planned shutdowns |
| F-08 | `opDaysInWeek(weekStart)` | 612 | count (integer) | Shorthand count of working days |
| F-09 | `remainingOpDaysInWeek(weekStart)` | 617 | count | Remaining working days from today in the current week |

### Production scheduling

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-10 | `scheduleEPCaskLines(...)` | 744 | `{days10, days5, shifts[], ...}` | Day-by-day allocation of EP Line A&B across 10L/5L Cask. Do not call from render functions — call via `planWeek` only. |
| F-11 | `scheduleBottleLine(...)` | 833 | `{shifts[], endStock2L, endStock12, endStock6, ...}` | EP New Line (bottle) scheduling. Same constraint: route through `planWeek`. |
| F-12 | `planWeek(week)` | 1152 | `{avail, plannedProd, stockEnd, coverDays, satUsed, totalNet, ...}` | **Master integration function.** Calls F-10 and F-11, rolls stock forward, returns complete weekly plan. All render functions consume this result — never re-derive avail/cover/capacity independently. |
| F-13 | `forwardSimulate(fromWeekIdx, openStock, eff)` | ~1100 | `{deficits}` | Multi-week capacity deficit projection loop (used internally by planWeek). Not called from render functions. |

### Alerts and display

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-14 | `buildAllAlerts()` | 2709 | void (writes to DOM) | All alert generation — cover breach, trajectory, night shift, Saturday triggers. |
| F-15 | `getMaxPal(schedEntry)` | 2431 | base pallets/shift | Display-only: maps a schedule entry to its line capacity denominator. Not used in planning calculations. |
| F-16 | `buildSchedule(week, pr)` | 1907 | `[{day,shift,sku,pallets,...}]` | Converts planWeek result into renderable shift rows. |

### Data rebuild

| ID | Function | Line | Returns | Authoritative for |
|----|----------|------|---------|-------------------|
| F-17 | `rebuildData()` | 4787 | void | Merges uploaded forecasts (WW/Coles/Metcash) into COMBINED. Called after every file parse. |
| F-18 | `forwardFillDemand()` | 4712 | void | Projects known demand forward past each retailer's live horizon. Called by `rebuildData`. |

---

## Tier 3 — Known Justified Duplications

These patterns appear in multiple locations. Each occurrence is intentional and documented.
**The `npm test` LM tripwire enforces that the count does not increase.**
If a rate changes, every location in this table must be updated.

| Pattern | Count | Locations | Why duplicated | Risk on rate change |
|---------|-------|-----------|----------------|---------------------|
| `'Dual' ? 90 : 45` (HMPS pal/shift) | 4 | `forwardSimulate` (1115), `planWeek` (1158), `renderRollingTable` (2131), `buildAllAlerts` (2890) | Each function runs in a separate context that cannot efficiently call planWeek for projection purposes | All 4 locations need updating if HMPS throughput changes |
| `? 30 : 60` (EP 10L base/shift) | 3 | `scheduleEPCaskLines` (750), `forwardSimulate` (1113), `planWeek` (1404) | forwardSimulate and planWeek pre-compute needed days before calling the authoritative scheduler | All 3 locations |
| `? 27 : 50` (EP 5L base/shift) | 4 | `scheduleEPCaskLines` (751), `forwardSimulate` (1114), `planWeek` (1405), `planWeek` Saturday block (1630) | Same as above, plus Saturday scheduling in planWeek bypasses scheduleEPCaskLines for single-shift logic | All 4 locations |
| `tgt=52` / `tgt:52` (Bottle 2L base/shift) | 3+ | `getMaxPal` (2437), `planWeek` stub (1503), `planWeek` Saturday block (1638) | getMaxPal is display-only; planWeek stub is legacy compatibility for renderProdTable | getMaxPal + planWeek both need updating |
| EP New Line rates (12pk:34, 6pk:32) | 2+ | `getMaxPal` (2438-2439), `planWeek` Saturday block (1639-1640) | Same as 2L above | Both locations |

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

*Last updated: 14/07/2026 — covers C2, H1, H2, H3, H4, H5, M6 audit findings.*
