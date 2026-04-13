import type { SignificanceLabel } from "./types";

// ── Standard normal CDF ─────────────────────────────────────────────
// Abramowitz & Stegun 26.2.17 rational approximation. Max error ~7.5e-8.

function normalCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1 + sign * y);
}

// ── Exact Wilcoxon critical values ──────────────────────────────────
// Two-tailed critical values at alpha=0.05 for n=1..25.
// W_critical: reject H0 if W+ <= value or W+ >= n(n+1)/2 - value.
// Source: standard statistical tables.

const WILCOXON_EXACT_CRITICAL: Record<number, number> = {
  // n: critical W value for two-tailed alpha=0.05
  5: 0,
  6: 2,
  7: 3,
  8: 5,
  9: 8,
  10: 10,
  11: 13,
  12: 17,
  13: 21,
  14: 25,
  15: 30,
  16: 35,
  17: 41,
  18: 47,
  19: 53,
  20: 60,
  21: 67,
  22: 75,
  23: 83,
  24: 91,
  25: 100,
};

// ── Wilcoxon signed-rank test ───────────────────────────────────────

export interface WilcoxonResult {
  W: number; // W+ (sum of positive ranks)
  n: number; // effective sample size (after discarding zeros)
  pValue: number | null; // two-tailed p-value, null if n < 5
}

export function wilcoxonSignedRank(diffs: number[]): WilcoxonResult {
  // Remove zero differences (ties with H0)
  const nonZero = diffs.filter((d) => d !== 0);
  const n = nonZero.length;

  if (n < 5) {
    return { W: 0, n, pValue: null };
  }

  // Rank by absolute value, handle ties via mid-rank
  const indexed = nonZero.map((d, i) => ({ abs: Math.abs(d), sign: d > 0 ? 1 : -1, idx: i }));
  indexed.sort((a, b) => a.abs - b.abs);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j + 1].abs === indexed[j].abs) {
      j++;
    }
    // Assign mid-rank to tied group [i, j]
    const midRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) {
      ranks[k] = midRank;
    }
    i = j + 1;
  }

  // W+ = sum of ranks for positive differences
  let wPlus = 0;
  for (let k = 0; k < n; k++) {
    if (indexed[k].sign > 0) {
      wPlus += ranks[k];
    }
  }

  let pValue: number;

  if (n <= 25 && WILCOXON_EXACT_CRITICAL[n] !== undefined) {
    // Exact test: compare W+ against critical values
    const wMax = (n * (n + 1)) / 2;
    const wMin = Math.min(wPlus, wMax - wPlus);
    const critical = WILCOXON_EXACT_CRITICAL[n];

    if (wMin <= critical) {
      // Significant — estimate p from normal approximation for precision
      const mean = wMax / 2;
      const variance = (n * (n + 1) * (2 * n + 1)) / 24;
      const z = (wPlus - mean) / Math.sqrt(variance);
      pValue = 2 * (1 - normalCdf(Math.abs(z)));
    } else {
      // Not significant — use normal approximation for the p-value
      const mean = wMax / 2;
      const variance = (n * (n + 1) * (2 * n + 1)) / 24;
      const z = (wPlus - mean) / Math.sqrt(variance);
      pValue = 2 * (1 - normalCdf(Math.abs(z)));
    }
  } else {
    // Normal approximation with continuity correction for n > 25
    const mean = (n * (n + 1)) / 4;
    const variance = (n * (n + 1) * (2 * n + 1)) / 24;
    const z = (Math.abs(wPlus - mean) - 0.5) / Math.sqrt(variance);
    pValue = 2 * (1 - normalCdf(z));
  }

  return { W: wPlus, n, pValue: Math.min(pValue, 1) };
}

// ── Hodges-Lehmann estimator + CI ───────────────────────────────────
// Point estimate: median of all Walsh averages (d_i + d_j) / 2 for i <= j.
// 95% CI: based on Wilcoxon distribution quantiles.

export interface HodgesLehmannResult {
  estimate: number;
  ci95Lower: number | null;
  ci95Upper: number | null;
}

function sortedMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Approximate K for the CI bounds using normal approximation
// K = n(n+1)/4 - z_{alpha/2} * sqrt(n(n+1)(2n+1)/24)
function ciRankBound(n: number): number {
  const z = 1.96; // z_{0.025} for 95% CI
  const mean = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24;
  return Math.ceil(mean - z * Math.sqrt(variance));
}

export function hodgesLehmann(diffs: number[]): HodgesLehmannResult {
  const nonZero = diffs.filter((d) => d !== 0);
  const n = nonZero.length;

  if (n < 5) {
    return { estimate: 0, ci95Lower: null, ci95Upper: null };
  }

  // Compute all n(n+1)/2 Walsh averages
  const walsh: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      walsh.push((nonZero[i] + nonZero[j]) / 2);
    }
  }
  walsh.sort((a, b) => a - b);

  const estimate = sortedMedian(walsh);

  // CI bounds
  const k = ciRankBound(n);
  if (k < 1 || k > walsh.length) {
    return { estimate, ci95Lower: null, ci95Upper: null };
  }

  // K-th smallest and K-th largest Walsh average
  const ci95Lower = walsh[k - 1]; // 1-indexed → 0-indexed
  const ci95Upper = walsh[walsh.length - k];

  return { estimate, ci95Lower, ci95Upper };
}

// ── Significance label from p-value ─────────────────────────────────

export function significanceLabelFromP(pValue: number | null): SignificanceLabel {
  if (pValue === null || pValue >= 0.05) return "within noise";
  if (pValue >= 0.01) return "measurable";
  return "significant";
}
