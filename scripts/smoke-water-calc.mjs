/**
 * Lightweight smoke test for dynamic water math (no React Native runtime).
 * Mirrors src/services/waterCalc.ts rules used in v1.
 */

function minutesBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

function buildIntervalSuggestions(remainingMl, remainingMinutes) {
  const intervals = [5, 10, 15, 20, 30];
  if (remainingMl <= 0 || remainingMinutes <= 0) {
    return intervals.map((intervalMinutes) => ({
      intervalMinutes,
      remainingCount: 0,
      mlPerDrink: 0,
    }));
  }
  return intervals.map((intervalMinutes) => {
    const remainingCount = Math.max(1, Math.floor(remainingMinutes / intervalMinutes));
    const mlPerDrink = Math.ceil(remainingMl / remainingCount);
    return { intervalMinutes, remainingCount, mlPerDrink };
  });
}

const wake = new Date('2026-10-02T10:00:00');
const cutoff = new Date('2026-10-02T21:00:00');
const now = new Date('2026-10-02T10:00:00');
const remainingMl = 2500 - 300;
const remainingMinutes = minutesBetween(now, cutoff);
const rows = buildIntervalSuggestions(remainingMl, remainingMinutes);

const expectedMinutes = 11 * 60;
if (remainingMinutes !== expectedMinutes) {
  throw new Error(`expected ${expectedMinutes} remaining minutes, got ${remainingMinutes}`);
}

const thirty = rows.find((r) => r.intervalMinutes === 30);
if (!thirty || thirty.remainingCount !== 22 || thirty.mlPerDrink !== 100) {
  throw new Error(`unexpected 30-min row: ${JSON.stringify(thirty)}`);
}

console.log('smoke-water-calc OK');
console.table(rows);
