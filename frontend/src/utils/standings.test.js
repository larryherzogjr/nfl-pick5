import test from "node:test";
import assert from "node:assert/strict";

import { buildWeeklyCells, perfectWeekCount } from "./standings.js";

test("perfect week count uses the authoritative backend value", () => {
  const entry = {
    perfect_weeks: 0,
    weekly_breakdown: [{ week: 1, points: 6, is_perfect: false }],
  };

  assert.equal(perfectWeekCount(entry), 0);
});

test("weekly cells preserve perfect status and include postseason weeks", () => {
  const cells = buildWeeklyCells([
    { week: 1, points: 6, is_perfect: false },
    { week: 19, points: 5, is_perfect: true },
  ]);

  assert.equal(cells.length, 19);
  assert.deepEqual(cells[0], { week: 1, points: 6, isPerfect: false });
  assert.deepEqual(cells[18], { week: 19, points: 5, isPerfect: true });
});

test("preseason standings can render a three-week strip", () => {
  const cells = buildWeeklyCells(
    [{ week: 1, points: 4, is_perfect: false }],
    3,
  );

  assert.equal(cells.length, 3);
  assert.deepEqual(cells[0], { week: 1, points: 4, isPerfect: false });
});
