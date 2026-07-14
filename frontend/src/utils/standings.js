const REGULAR_SEASON_WEEKS = 18;

export function perfectWeekCount(entry) {
  return Number.isInteger(entry?.perfect_weeks) ? entry.perfect_weeks : 0;
}

export function buildWeeklyCells(
  breakdown = [],
  minimumWeeks = REGULAR_SEASON_WEEKS,
) {
  const byWeek = new Map();
  let highestWeek = minimumWeeks;

  for (const entry of breakdown) {
    if (!Number.isInteger(entry.week) || entry.week < 1) continue;
    byWeek.set(entry.week, entry);
    highestWeek = Math.max(highestWeek, entry.week);
  }

  return Array.from({ length: highestWeek }, (_, index) => {
    const week = index + 1;
    const entry = byWeek.get(week);
    return {
      week,
      points: entry?.points ?? null,
      isPerfect: entry?.is_perfect === true,
    };
  });
}
