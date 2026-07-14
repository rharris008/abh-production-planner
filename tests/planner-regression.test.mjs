/**
 * ABH Production Planner — Regression Test Suite
 * Finding IDs: C2, H1, H2, H3, H4, H5, M6 (diagnostic audit 11/07/2026)
 *
 * Runner: node:test (built-in, Node 18+). No install required.
 * Run:    npm test   OR   node --test tests/planner-regression.test.mjs
 *
 * Each test is labelled with its finding ID so a failure immediately identifies
 * which original bug has come back.
 *
 * STANDING RULE (added CLAUDE.md 14/07/2026): this suite must pass before any
 * commit that touches planning logic in index.html.
 *
 * ── KNOWN GAP — numeric calculation correctness ────────────────────────────
 * The index.html planning engine (planWeek, scheduleEPCaskLines, buildAllAlerts,
 * coverDays formula) is entangled with browser APIs (DOM, fetch, Supabase).
 * Extracting and running those functions in Node would require a full DOM shim
 * and Supabase stub — not done here.
 *
 * As a result, the C2 and H3 tests are STRUCTURE-ONLY:
 *
 *   C2: confirms STOCK_COVER.floor/target are REFERENCED in renderStockTable
 *       and buildAllAlerts — does NOT execute them and verify that a known
 *       stock/demand input produces the correct cover-days number.
 *
 *   H3: confirms pr.plannedProd is READ in renderReplan and capPerDay is not
 *       DEFINED there — does NOT call scheduleEPCaskLines() with a fixed input
 *       and assert that renderReplan displays the same capacity figure.
 *
 * "43 tests passing" does NOT mean calculation correctness is verified for
 * these two items. It means the structural fix (correct source referenced,
 * banned pattern absent) has not been reverted.
 *
 * To close this gap properly: extract the pure numeric functions into a
 * separate module (no DOM dependency) and add input→output tests there.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

/**
 * Extract the source text of a top-level function by name.
 * Searches for `function NAME(` and captures to the next top-level `\nfunction ` or end of script.
 */
function extractFn(name) {
  const marker = `function ${name}(`;
  const start = SRC.indexOf(marker);
  if (start < 0) return null;
  const next = SRC.indexOf('\nfunction ', start + marker.length);
  return SRC.slice(start, next > start ? next : start + 8000);
}


// ══════════════════════════════════════════════════════════════════════════════
// H1 — FY year derivation  (was hardcoded fy_year=eq.2027)
// Fix: dynamic calculation from localToday(). Month ≥ 7 → year+1.
// ══════════════════════════════════════════════════════════════════════════════
describe('H1: FY year derivation', () => {

  // Inline the pure logic extracted from the H1 fix block in index.html (line ~5798-5799)
  function calcFyYear(dateStr) {
    const mm   = parseInt(dateStr.slice(5, 7), 10);
    const yyyy = parseInt(dateStr.slice(0, 4), 10);
    return mm >= 7 ? yyyy + 1 : yyyy;
  }

  test('H1 — 30/06/2027 (last day of FY27) → FY year 2027', () => {
    assert.equal(calcFyYear('2027-06-30'), 2027);
  });

  test('H1 — 01/07/2027 (first day of FY28) → FY year 2028', () => {
    assert.equal(calcFyYear('2027-07-01'), 2028);
  });

  test('H1 — 14/07/2026 (today, mid FY27) → FY year 2027', () => {
    assert.equal(calcFyYear('2026-07-14'), 2027);
  });

  test('H1 — 31/12/2026 (Dec mid-year) → FY year 2027', () => {
    assert.equal(calcFyYear('2026-12-31'), 2027);
  });

  test('H1 — source uses dynamic derivation, not hardcoded fy_year=eq.2027', () => {
    assert.ok(
      !SRC.includes('fy_year=eq.2027'),
      'FAIL H1: hardcoded fy_year=eq.2027 found — H1 fix was reverted'
    );
  });

  test('H1 — source contains the dynamic FY derivation expression', () => {
    // Exact expression from line 5799 of current source
    assert.ok(
      SRC.includes('_fyMM >= 7 ? _fyYYYY + 1 : _fyYYYY'),
      'FAIL H1: dynamic FY year expression (_fyMM >= 7 ? _fyYYYY + 1 : _fyYYYY) not found'
    );
  });

});


// ══════════════════════════════════════════════════════════════════════════════
// H2 — BUDGET_DATA_UPDATED staleness badge
// Fix: constant + badge renders neutral under 90 days, amber at/over 90 days.
// ══════════════════════════════════════════════════════════════════════════════
describe('H2: Budget staleness badge', () => {

  function daysSince(updatedDate, today) {
    return Math.floor(
      (new Date(today + 'T00:00:00') - new Date(updatedDate + 'T00:00:00')) / 86400000
    );
  }
  const STALE_THRESHOLD = 90;

  test('H2 — BUDGET_DATA_UPDATED constant present in source', () => {
    assert.ok(
      SRC.includes("const BUDGET_DATA_UPDATED = '2026-06-22'"),
      "FAIL H2: BUDGET_DATA_UPDATED constant not found — was it removed or renamed?"
    );
  });

  test('H2 — 89 days since update → not stale (neutral badge)', () => {
    // 2026-06-22 + 89 days = 2026-09-19
    const days = daysSince('2026-06-22', '2026-09-19');
    assert.equal(days, 89);
    assert.equal(days < STALE_THRESHOLD, true);
  });

  test('H2 — 90 days since update → stale (amber badge fires)', () => {
    // 2026-06-22 + 90 days = 2026-09-20
    const days = daysSince('2026-06-22', '2026-09-20');
    assert.equal(days, 90);
    assert.equal(days >= STALE_THRESHOLD, true);
  });

  test('H2 — 91 days → still stale', () => {
    assert.equal(daysSince('2026-06-22', '2026-09-21') >= STALE_THRESHOLD, true);
  });

  test('H2 — renderBudget contains _bdgDays >= 90 threshold check', () => {
    assert.ok(
      SRC.includes('_bdgDays >= 90'),
      'FAIL H2: staleness threshold (_bdgDays >= 90) not found in source'
    );
  });

  test('H2 — renderBudget references BUDGET_DATA_UPDATED constant (not a hardcoded date)', () => {
    const fnBody = extractFn('renderBudget');
    assert.ok(fnBody, 'renderBudget function not found');
    assert.ok(
      fnBody.includes('BUDGET_DATA_UPDATED'),
      'FAIL H2: renderBudget does not reference BUDGET_DATA_UPDATED — badge date may be hardcoded'
    );
  });

});


// ══════════════════════════════════════════════════════════════════════════════
// C2 — STOCK_COVER single config object
// Fix: STOCK_COVER = {target:5, floor:3} is the single threshold authority.
//      MIN_CASK_COVER and EMERGENCY_FLOOR removed as live variables.
// ══════════════════════════════════════════════════════════════════════════════
describe('C2: STOCK_COVER unified config', () => {

  test('C2 — STOCK_COVER defined with target=5', () => {
    assert.ok(
      SRC.includes('target: 5,') || SRC.includes('target:5,'),
      'FAIL C2: STOCK_COVER.target=5 not found'
    );
  });

  test('C2 — STOCK_COVER defined with floor=3', () => {
    assert.ok(
      /floor:\s*3/.test(SRC),
      'FAIL C2: STOCK_COVER.floor=3 not found'
    );
  });

  test('C2 — no const EMERGENCY_FLOOR definition (only removal comment is acceptable)', () => {
    assert.ok(
      !SRC.includes('const EMERGENCY_FLOOR'),
      'FAIL C2: const EMERGENCY_FLOOR still defined — C2 consolidation was reverted'
    );
  });

  test('C2 — no const MIN_CASK_COVER definition (only removal comment is acceptable)', () => {
    assert.ok(
      !SRC.includes('const MIN_CASK_COVER'),
      'FAIL C2: const MIN_CASK_COVER still defined — C2 consolidation was reverted'
    );
  });

  test('C2 — renderStockTable uses STOCK_COVER.floor (not a magic number)', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      fnBody.includes('STOCK_COVER.floor'),
      'FAIL C2: renderStockTable does not reference STOCK_COVER.floor'
    );
  });

  test('C2 — renderStockTable uses STOCK_COVER.target (not a magic number)', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      fnBody.includes('STOCK_COVER.target'),
      'FAIL C2: renderStockTable does not reference STOCK_COVER.target'
    );
  });

  test('C2 — forward-look alert uses STOCK_COVER.floor for breach detection', () => {
    const fnBody = extractFn('buildAllAlerts');
    assert.ok(fnBody, 'buildAllAlerts not found');
    assert.ok(
      fnBody.includes('STOCK_COVER.floor'),
      'FAIL C2: buildAllAlerts does not reference STOCK_COVER.floor for breach detection'
    );
  });

  test('C2 — FORWARD_LOOK_WEEKS = 4 (not changed from the verified 4-week horizon)', () => {
    assert.ok(
      SRC.includes('FORWARD_LOOK_WEEKS = 4'),
      'FAIL C2: FORWARD_LOOK_WEEKS is not 4 — alert horizon has changed'
    );
  });

});


// ══════════════════════════════════════════════════════════════════════════════
// H3 — renderReplan capacity from planWeek (no independent capPerDay formula)
// Fix: expectedRemaining[s] = pr.plannedProd[s] instead of local capacity recalc.
// ══════════════════════════════════════════════════════════════════════════════
describe('H3: renderReplan uses planWeek plannedProd', () => {

  test('H3 — renderReplan reads pr.plannedProd (not an independent capacity formula)', () => {
    const fnBody = extractFn('renderReplan');
    assert.ok(fnBody, 'renderReplan not found');
    assert.ok(
      fnBody.includes('pr.plannedProd') || fnBody.includes('plannedProd[s]'),
      'FAIL H3: pr.plannedProd not referenced in renderReplan'
    );
  });

  test('H3 — H3 fix comment present in renderReplan (source annotation)', () => {
    const fnBody = extractFn('renderReplan');
    assert.ok(fnBody, 'renderReplan not found');
    assert.ok(
      fnBody.includes('H3 fix'),
      'FAIL H3: H3 fix comment not found in renderReplan — may have been overwritten'
    );
  });

  test('H3 — no independent capPerDay variable DEFINED in renderReplan (comment mention ok)', () => {
    const fnBody = extractFn('renderReplan');
    assert.ok(fnBody, 'renderReplan not found');
    // Check for a variable DEFINITION (const/let/var capPerDay) — a comment mentioning the
    // old name is acceptable; a live definition means the pre-fix formula was reintroduced.
    assert.ok(
      !/(?:const|let|var)\s+capPerDay/.test(fnBody),
      'FAIL H3: const/let/var capPerDay found in renderReplan — pre-fix independent formula reintroduced'
    );
  });

});


// ══════════════════════════════════════════════════════════════════════════════
// H4 — renderStockTable avail/cover from planWeek (no OO double-count)
// Fix: avail = pr.avail[s] (planAvail), cover = pr.coverDays[s] (planCoverDays).
//      OO column is informational only — not subtracted from stock.
// ══════════════════════════════════════════════════════════════════════════════
describe('H4: renderStockTable avail and cover from planWeek', () => {

  test('H4 — renderStockTable destructures avail from planWeek result (planAvail)', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      fnBody.includes('planAvail') || fnBody.includes('avail:planAvail'),
      'FAIL H4: planAvail not found in renderStockTable — avail may not come from planWeek'
    );
  });

  test('H4 — renderStockTable destructures coverDays from planWeek result (planCoverDays)', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      fnBody.includes('planCoverDays') || fnBody.includes('coverDays:planCoverDays'),
      'FAIL H4: planCoverDays not found in renderStockTable — cover may not come from planWeek'
    );
  });

  test('H4 — renderStockTable does NOT subtract openOrdersPal from stock (no double-count)', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      !fnBody.includes('stockPal[s] - openOrdersPal'),
      'FAIL H4: stockPal[s] - openOrdersPal found in renderStockTable — OO double-count reintroduced'
    );
  });

  test('H4 — renderStockTable uses netDem[s] from planWeek for net-to-produce column', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      fnBody.includes('netDem[s]'),
      'FAIL H4: netDem[s] not used in renderStockTable — net-to-produce column source changed'
    );
  });

  test('H4 — H4 fix comment present in renderStockTable (source annotation)', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    assert.ok(
      fnBody.includes('H4 fix'),
      'FAIL H4: H4 fix comment not found in renderStockTable'
    );
  });

  test('H4 — cover and net-to-produce both come from the same planWeek destructure', () => {
    const fnBody = extractFn('renderStockTable');
    assert.ok(fnBody, 'renderStockTable not found');
    // Both must be present in the destructure line
    const destructure = fnBody.match(/const\s*\{[^}]+\}\s*=\s*pr/);
    assert.ok(destructure, 'No planWeek destructure found in renderStockTable');
    const dStr = destructure[0];
    assert.ok(
      dStr.includes('netDem') || fnBody.includes('netDem'),
      'FAIL H4: netDem not extracted from pr — net column may use a different source'
    );
    assert.ok(
      dStr.includes('coverDays') || fnBody.includes('coverDays:planCoverDays'),
      'FAIL H4: coverDays not extracted from pr — cover bar may use a different source'
    );
  });

});


// ══════════════════════════════════════════════════════════════════════════════
// H5 — parseActuals: no monkey-patch, sbPushUpsert called directly
// Fix: Supabase sync merged into parseActuals body; _origParseActuals wrapper removed.
// ══════════════════════════════════════════════════════════════════════════════
describe('H5: parseActuals monkey-patch removed', () => {

  test('H5 — parseActuals defined as a regular function declaration', () => {
    assert.ok(
      SRC.includes('function parseActuals('),
      'FAIL H5: parseActuals function not found'
    );
  });

  test('H5 — parseActuals NOT defined via variable reassignment', () => {
    assert.ok(
      !SRC.includes('parseActuals = function'),
      'FAIL H5: parseActuals = function found — monkey-patch wrapper reintroduced'
    );
  });

  test('H5 — no _origParseActuals variable (old monkey-patch sentinel)', () => {
    assert.ok(
      !SRC.includes('_origParseActuals'),
      'FAIL H5: _origParseActuals variable found — old monkey-patch still present'
    );
  });

  test("H5 — sbPushUpsert('actuals') called inside parseActuals function body", () => {
    const fnBody = extractFn('parseActuals');
    assert.ok(fnBody, 'parseActuals function not found');
    assert.ok(
      fnBody.includes("sbPushUpsert('actuals'"),
      "FAIL H5: sbPushUpsert('actuals') not found inside parseActuals body — Supabase sync may be broken"
    );
  });

  test('H5 — H5 fix comment present in parseActuals body', () => {
    const fnBody = extractFn('parseActuals');
    assert.ok(fnBody, 'parseActuals function not found');
    assert.ok(
      fnBody.includes('H5 fix'),
      'FAIL H5: H5 fix comment not found in parseActuals — may have been overwritten'
    );
  });

});


// ══════════════════════════════════════════════════════════════════════════════
// M6 — Batch cleanup: dead code removed, OPEN_ORDER_PRICE single source
// ══════════════════════════════════════════════════════════════════════════════
describe('M6: Batch cleanup structural checks', () => {

  test('M6 — parseMetcash CSV function removed (dead path)', () => {
    assert.ok(
      !SRC.includes('function parseMetcash(text, fname)'),
      'FAIL M6: function parseMetcash(text, fname) found — dead CSV parser was reintroduced'
    );
  });

  test('M6 — parseMetcashWB (live SheetJS path) still present', () => {
    assert.ok(
      SRC.includes('function parseMetcashWB('),
      'FAIL M6: parseMetcashWB not found — live Metcash parser was accidentally removed'
    );
  });

  test('M6 — OPEN_ORDER_PRICE_LOCAL duplicate removed', () => {
    assert.ok(
      !SRC.includes('OPEN_ORDER_PRICE_LOCAL'),
      'FAIL M6: OPEN_ORDER_PRICE_LOCAL still present — duplicate price table not consolidated'
    );
  });

  test('M6 — const OPEN_ORDER_PRICE defined exactly once', () => {
    const defs = (SRC.match(/const OPEN_ORDER_PRICE\b/g) || []).length;
    assert.equal(
      defs, 1,
      `FAIL M6: expected 1 definition of const OPEN_ORDER_PRICE, found ${defs}`
    );
  });

  test('M6 — PLAN_TARGETS dead constant removed', () => {
    assert.ok(
      !SRC.includes('const PLAN_TARGETS'),
      'FAIL M6: const PLAN_TARGETS still present — dead constant was reintroduced'
    );
  });

  test('M6 — scheduleEPNewLine dead function removed', () => {
    assert.ok(
      !SRC.includes('function scheduleEPNewLine('),
      'FAIL M6: function scheduleEPNewLine still defined — dead code was reintroduced'
    );
  });

  test('M6 — otherDemand staleness badge uses >5 pal gap threshold', () => {
    const fnBody = extractFn('renderOCGrid');
    assert.ok(fnBody, 'renderOCGrid not found');
    assert.ok(
      fnBody.includes('_gap>5') || fnBody.includes('_gap > 5'),
      'FAIL M6: gap>5 threshold not found in renderOCGrid — staleness badge threshold changed'
    );
  });

  test('M6 — otherDemand staleness badge uses >20% percentage threshold', () => {
    const fnBody = extractFn('renderOCGrid');
    assert.ok(fnBody, 'renderOCGrid not found');
    assert.ok(
      fnBody.includes('_pct>0.2') || fnBody.includes('_pct > 0.2'),
      'FAIL M6: pct>0.2 (20%) threshold not found in renderOCGrid — staleness badge threshold changed'
    );
  });

  test('M6 — Thu/Fri note present in renderOCGrid with correct dayOfWeek basis (_dow>=3)', () => {
    const fnBody = extractFn('renderOCGrid');
    assert.ok(fnBody, 'renderOCGrid not found');
    assert.ok(
      fnBody.includes('_dow>=3') || fnBody.includes('_dow >= 3'),
      'FAIL M6: _dow>=3 threshold not found in renderOCGrid — Thu/Fri note trigger changed'
    );
    assert.ok(
      fnBody.includes('Thu/Fri'),
      'FAIL M6: Thu/Fri note text not found in renderOCGrid — note was removed'
    );
  });

});
