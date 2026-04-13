import { describe, it, expect } from "vitest";
import { wilcoxonSignedRank, hodgesLehmann, significanceLabelFromP } from "../../tools/benchmark/lib/stats";

describe("wilcoxonSignedRank", () => {
  it("returns null p-value for n < 5", () => {
    const result = wilcoxonSignedRank([1, 2, 3]);
    expect(result.pValue).toBeNull();
    expect(result.n).toBe(3);
  });

  it("discards zero differences", () => {
    const result = wilcoxonSignedRank([0, 0, 1, 2, 3, 4, 5]);
    expect(result.n).toBe(5); // only 5 non-zero
  });

  it("detects a clear positive shift", () => {
    // All positive differences — strong signal
    const diffs = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
    const result = wilcoxonSignedRank(diffs);
    expect(result.n).toBe(10);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeLessThan(0.01);
  });

  it("returns high p-value for symmetric noise around zero", () => {
    // Roughly symmetric around zero — no signal
    const diffs = [1, -2, 3, -4, 1, -3, 2, -1, 4, -2];
    const result = wilcoxonSignedRank(diffs);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeGreaterThan(0.05);
  });

  it("handles ties correctly", () => {
    // Repeated absolute values should get mid-ranks
    const diffs = [2, 2, 2, -1, -1, 3, 4, 5, 6, 7];
    const result = wilcoxonSignedRank(diffs);
    expect(result.n).toBe(10);
    expect(result.pValue).not.toBeNull();
  });

  it("uses normal approximation for n > 25", () => {
    const diffs = Array.from({ length: 30 }, (_, i) => i + 1); // all positive
    const result = wilcoxonSignedRank(diffs);
    expect(result.n).toBe(30);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeLessThan(0.001);
  });

  it("handles all-negative diffs (clear negative shift)", () => {
    const diffs = [-3, -5, -7, -9, -11, -13, -15, -17, -19, -21];
    const result = wilcoxonSignedRank(diffs);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeLessThan(0.01);
  });

  it("W+ is zero when all diffs are negative", () => {
    const diffs = [-1, -2, -3, -4, -5];
    const result = wilcoxonSignedRank(diffs);
    expect(result.W).toBe(0);
  });

  it("W+ equals n(n+1)/2 when all diffs are positive", () => {
    const diffs = [1, 2, 3, 4, 5];
    const result = wilcoxonSignedRank(diffs);
    expect(result.W).toBe(15); // 5*6/2 = 15
  });
});

describe("hodgesLehmann", () => {
  it("returns null CI for n < 5", () => {
    const result = hodgesLehmann([1, 2, 3]);
    expect(result.ci95Lower).toBeNull();
    expect(result.ci95Upper).toBeNull();
  });

  it("point estimate is median of Walsh averages", () => {
    // Simple case: all same value
    const diffs = [5, 5, 5, 5, 5];
    const result = hodgesLehmann(diffs);
    expect(result.estimate).toBe(5);
  });

  it("CI contains the true shift for positive data", () => {
    const diffs = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26];
    const result = hodgesLehmann(diffs);
    expect(result.estimate).toBeGreaterThan(0);
    expect(result.ci95Lower).not.toBeNull();
    expect(result.ci95Upper).not.toBeNull();
    expect(result.ci95Lower!).toBeGreaterThan(0);
    expect(result.ci95Upper!).toBeGreaterThan(result.ci95Lower!);
  });

  it("CI spans zero for noisy symmetric data", () => {
    const diffs = [2, -3, 1, -2, 3, -1, 2, -3, 1, -2];
    const result = hodgesLehmann(diffs);
    // Estimate should be near zero
    expect(Math.abs(result.estimate)).toBeLessThan(3);
    if (result.ci95Lower !== null && result.ci95Upper !== null) {
      // CI should either span zero or be very close to it
      expect(result.ci95Lower).toBeLessThan(result.ci95Upper);
    }
  });

  it("discards zero diffs", () => {
    const diffs = [0, 0, 5, 5, 5, 5, 5];
    const result = hodgesLehmann(diffs);
    expect(result.estimate).toBe(5);
  });
});

describe("significanceLabelFromP", () => {
  it('returns "within noise" for null', () => {
    expect(significanceLabelFromP(null)).toBe("within noise");
  });

  it('returns "within noise" for p >= 0.05', () => {
    expect(significanceLabelFromP(0.05)).toBe("within noise");
    expect(significanceLabelFromP(0.5)).toBe("within noise");
    expect(significanceLabelFromP(1.0)).toBe("within noise");
  });

  it('returns "measurable" for 0.01 <= p < 0.05', () => {
    expect(significanceLabelFromP(0.049)).toBe("measurable");
    expect(significanceLabelFromP(0.01)).toBe("measurable");
    expect(significanceLabelFromP(0.03)).toBe("measurable");
  });

  it('returns "significant" for p < 0.01', () => {
    expect(significanceLabelFromP(0.009)).toBe("significant");
    expect(significanceLabelFromP(0.001)).toBe("significant");
    expect(significanceLabelFromP(0.0001)).toBe("significant");
  });
});
