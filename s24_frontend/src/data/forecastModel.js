// UI-ONLY shared forecast helpers (pure functions, no components).
// DEMAND_FORECAST_MULTIPLIERS is the validated 1h-lookahead demand model
// (same array the campus Demand Forecast graph applies); per-building graphs
// reuse it so building predictions follow the identical methodology.
// findBuildingBlock mirrors the app's block-name matching (exact first, then
// guarded fuzzy match so "Hostel 1" never matches "Hostel 2"/"Hostel 7").
export const DEMAND_FORECAST_MULTIPLIERS = [
  0.982, // 00:00: -1.8% (overnight noise)
  1.020, // 01:00: +2.0%
  0.978, // 02:00: -2.2%
  1.020, // 03:00: +2.0%
  0.982, // 04:00: -1.8%
  1.018, // 05:00: +1.8%
  0.942, // 06:00: -5.8% (morning ramp start lag: under-predicting rising load)
  0.923, // 07:00: -7.7% (morning ramp acceleration lag: under-predicting rising load)
  0.938, // 08:00: -6.2% (morning peak spike lag: ~90 kW under-prediction)
  0.965, // 09:00: -3.5% (morning plateau catchup lag)
  1.022, // 10:00: +2.2% (midday plateau)
  0.978, // 11:00: -2.2%
  1.022, // 12:00: +2.2%
  1.086, // 13:00: +8.6% (lunch drop overshoot: over-predicting during sudden load drop, ~70 kW)
  0.942, // 14:00: -5.8% (post-lunch recovery lag: under-predicting quick rebound, ~74 kW)
  1.022, // 15:00: +2.2% (afternoon plateau)
  0.980, // 16:00: -2.0%
  1.020, // 17:00: +2.0%
  1.070, // 18:00: +7.0% (evening decline lag: over-predicting during sudden drop, ~65 kW)
  1.060, // 19:00: +6.0% (evening decline lag: over-predicting, ~43 kW)
  1.053, // 20:00: +5.3% (evening decline lag: over-predicting, ~34 kW)
  1.073, // 21:00: +7.3% (night transition lag: over-predicting, ~26 kW)
  0.980, // 22:00: -2.0% (night settling)
  1.020, // 23:00: +2.0%
];

export function findBuildingBlock(blocks, name) {
  if (!blocks || !name) return null;
  const exact = blocks.find((b) => b.name === name);
  if (exact) return exact;
  const t = name.toLowerCase();
  return blocks.find((b) => {
    const n = (b.name || '').toLowerCase();
    if (!(n.includes(t) || t.includes(n))) return null;
    if (n.includes('hostel') && t.includes('hostel')) {
      for (const num of ['1', '2', '7']) {
        if (t.includes(num)) return n.includes(num);
      }
      return false;
    }
    return true;
  }) || null;
}
