# ABH Production Planner — Diagnostic Report
**Date:** 29/09/2026  
**File:** `index.html` (485 KB, ~8,102 lines)  
**Method:** Targeted section reads via grep-confirmed line numbers. No full-file read.

---

## Summary

4 findings. 2 require immediate action (D-01, D-03). 1 is a risk item requiring a test fix (D-02). 1 is low-risk cleanup (D-04).

All planning logic that was checked is **functionally correct** — the issues are in the logic map documentation and one undocumented rate location, not in the running code.

---

## What Was Checked

| Area | Result |
|------|--------|
| STOCK_COVER usage (buildAllAlerts, planWeek) | PASS — uses `STOCK_COVER.target/.floor` throughout, no hardcoding |
| getDemand / getAdjustedDemand | PASS — clean |
| scheduleEPCaskLines EP rates | PASS — uses current rates `(lineAOnly ? 40 : 80)` / `(lineAOnly ? 30 : 59)` |
| forwardSimulate EP rates | PASS — matches scheduleEPCaskLines |
| planWeek avail stock calc | PASS — calls `availPal()`, no inline recompute |
| scheduleBottleLine | PASS — EMERGENCY_FLOOR removed, uses STOCK_COVER.floor correctly |
| forwardFillDemand part-week guard | PASS — guard intact, both daily-grain and lastFcstDate paths |
| rebuildData | PASS — uses SKUS.forEach, no hardcoded list |
| FY year derivation (H1) | PASS — dynamic formula at line 7255-7256, not hardcoded |
| HACCP tab structure | PASS — correct tracker CSS standard (solid-fill badges, stat-tiles) |
| Lock guard (`lockedWeeksSet`) | PASS — present at line 725, populated from Supabase `locked_weeks` |
| Saturday HMPS exclusion | PASS — `HMPS never runs Saturday` enforced in alerts and schedule notes |
| PLAN_TARGETS dead code | PASS — not found, already removed |

---

## Findings

### D-01 — Logic map Tier-3 table documents obsolete EP cask rates
**Severity: High** (misleads future edits)

The Tier-3 table in `PLANNER_LOGIC_MAP.md` records:

| Pattern | Documented rate |
|---------|----------------|
| EP 10L base/shift | `? 30 : 60` |
| EP 5L base/shift | `? 27 : 50` |

**Actual code uses** (as of Rob Harris 14/09/2026 update):
- `(lineAOnly ? 40 : 80)` for 10L
- `(lineAOnly ? 30 : 59)` for 5L

The regression tests were updated to match the new rates, but `PLANNER_LOGIC_MAP.md` was not. Anyone using the map as a reference to update rates across all locations would use the wrong numbers.

**Fix:** Update Tier-3 table rows for EP 10L and EP 5L. Audit that all documented locations use the new rates (they do — verified this session).

---

### D-02 — buildSchedule is an undocumented 5th HMPS rate location
**Severity: Medium** (tripwire may not catch it)

Tier-3 table documents `'Dual' ? 90 : 45` appearing in 4 locations:
- `forwardSimulate` (map line 1115, actual ~1449)
- `planWeek` (map line 1158, actual ~1520)
- `renderRollingTable` (map line 2131, actual ~3100+)
- `buildAllAlerts` (map line 2890, actual ~3900+)

`buildSchedule` at **line 2860** has:
```javascript
const dayTgt = mode === 'single' ? 45 : 90;
```

This is logically identical (single=45, not-single=90) but uses a **different condition variable** (`mode === 'single'` instead of `hmpsConfig === 'Dual'`). The LM tripwire regex for `'Dual' ? 90 : 45` would NOT match this form. It is an undocumented 5th occurrence.

**Risk:** If HMPS throughput changes (single from 45 to 50), the Tier-3 table says "4 locations" — `buildSchedule` is missed.

**Fix:**
1. Add `buildSchedule` (line 2860) to the Tier-3 HMPS row as a 5th location.
2. Add a tripwire test that catches `? 45 : 90` (the inverted form) or grep for the semantic equivalent.

---

### D-03 — All logic map line numbers are stale
**Severity: High** (map is unusable as navigation tool)

`PLANNER_LOGIC_MAP.md` was last updated 14/07/2026. There have been 112+ commits since. Every documented line number is wrong.

| Item | Map says | Actual | Drift |
|------|----------|--------|-------|
| C-01 STOCK_COVER | 539 | 717 | +178 |
| C-03 BUDGET_DATA_UPDATED | 500 | 683 | +183 |
| C-04 UPP | 519 | 702 | +183 |
| C-05 SKUS | 687 | 703 | +16 |
| C-06 ALL_WEEKS | 502 | 685 | +183 |
| F-01 availPal | 550 | 729 | +179 |
| F-02 getDemand | 667 | 1010 | +343 |
| F-03 getAdjustedDemand | 693 | 1032 | +339 |
| F-10 scheduleEPCaskLines | 744 | 1083 | +339 |
| F-11 scheduleBottleLine | 833 | 1174 | +341 |
| F-12 planWeek | 1152 | 1467 | +315 |
| F-13 forwardSimulate | ~1100 | 1416 | +316 |
| F-14 buildAllAlerts | 2709 | 3720 | +1011 |
| F-15 getMaxPal | 2431 | 3416 | +985 |
| F-16 buildSchedule | 1907 | 2798 | +891 |
| F-17 rebuildData | 4787 | 5908 | +1121 |
| F-18 forwardFillDemand | 4712 | 5817 | +1105 |

The Tier-3 duplication location references are also stale (same drift pattern applies).

**Fix:** Update all line numbers in `PLANNER_LOGIC_MAP.md` using the verified actuals above.

---

### D-04 — 600ml 12pk dead entries in companion constant objects
**Severity: Low** (SKUS loop excludes 12pk from all calculations)

`SKUS` at line 703 correctly does not include `'600ml 12pk'` (removed 27/08/2026).

However these objects still contain `'600ml 12pk'` keys:
- `STOCK_PAL` (line 697)
- `STOCK_UNITS` (line 698)
- `UPP` (line 702)
- `CHIP` (line 704)
- `onHoldPal` (line 728)
- `otherDemand` (line 730)

`CONFIRMED_SCHEDULES` also contains historical 12pk shifts from June-July 2026 — these are all past dates, locked historical data.

CSS class `.c12pk` at line 100 is also unreachable for future renders.

**Risk:** Low. The SKUS-driven loops skip 12pk. But the entries create confusion when reading constants and could mislead BOM or cost calculations that reference UPP directly by key.

**Fix:** Remove `'600ml 12pk'` keys from STOCK_PAL, STOCK_UNITS, UPP, CHIP, onHoldPal, otherDemand. Remove `.c12pk` CSS class. Historical CONFIRMED_SCHEDULES entries can stay (they are past-dated and read-only).

---

## Recommended Fix Order

1. **D-03 + D-01 combined (30 min):** Update `PLANNER_LOGIC_MAP.md` with correct line numbers from the table above, update Tier-3 EP cask rates to `(lineAOnly ? 40 : 80)` / `(lineAOnly ? 30 : 59)`.

2. **D-02 (20 min):** Add `buildSchedule` line 2860 to Tier-3 HMPS table. Add tripwire test covering `mode === 'single' ? 45 : 90` form.

3. **D-04 (15 min):** Remove 12pk keys from the 6 companion objects and the CSS class. Run `npm test` to confirm no regressions.

---

## Freeze Prevention Controls Deployed This Session

| Control | Status |
|---------|--------|
| `hook_large_file_guard.py` | LIVE — blocks full reads of files >150KB, forces targeted offset/limit reads |
| Hook registered in `settings.json` under `PreToolUse → matcher: "Read"` | LIVE |
| `PLANNER_LOGIC_MAP.md` as navigation aid | Needs line number refresh (D-03) |

The hook means future planner work will not silently fill context. Every read of `index.html` requires explicit offset/limit.

---

*Generated 29/09/2026. File read section by section using grep-confirmed line numbers.*
