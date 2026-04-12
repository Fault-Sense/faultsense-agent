import {
  type BenchmarkReport,
  type MetricSummary,
  type ScenarioResult,
  type PairResult,
  type SignificanceLabel,
  type ThrottleProfileName,
  THROTTLE_PROFILES,
} from "./types";

// ── HTML escaping ────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;")
    .replace(/\|/g, "&#124;");
}

// ── Inline stats ─────────────────────────────────────────────────────

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function iqr(values: number[]): number {
  if (values.length < 4) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  return sorted[q3Idx] - sorted[q1Idx];
}

export function significanceLabel(
  delta: number,
  baselineMedian: number,
  baselineIqr: number,
): SignificanceLabel {
  const absDelta = Math.abs(delta);
  // Zero delta is always within noise, regardless of baseline.
  if (absDelta === 0) return "within noise";
  const threshold = Math.max(baselineIqr, 0.05 * Math.abs(baselineMedian));
  // If baseline is zero/near-zero and threshold collapses to 0,
  // any non-zero delta is significant by definition.
  if (threshold === 0) return "significant";
  if (absDelta < threshold) return "within noise";
  if (absDelta < 2 * threshold) return "measurable";
  return "significant";
}

// ── Metric extraction ────────────────────────────────────────────────

function extractMetrics(
  scenario: ScenarioResult,
): MetricSummary[] {
  const pairs = scenario.pairs;
  if (pairs.length === 0) return [];

  const metricDefs: Array<{
    name: string;
    unit: string;
    extractA: (p: PairResult) => number;
    extractB: (p: PairResult) => number;
  }> = [
    {
      name: "LCP",
      unit: "ms",
      extractA: (p) => p.a.webVitals.lcp ?? 0,
      extractB: (p) => p.b.webVitals.lcp ?? 0,
    },
    {
      name: "CLS",
      unit: "",
      extractA: (p) => p.a.webVitals.cls ?? 0,
      extractB: (p) => p.b.webVitals.cls ?? 0,
    },
    {
      name: "INP",
      unit: "ms",
      extractA: (p) => p.a.webVitals.inp ?? 0,
      extractB: (p) => p.b.webVitals.inp ?? 0,
    },
    {
      name: "FCP",
      unit: "ms",
      extractA: (p) => p.a.webVitals.fcp ?? 0,
      extractB: (p) => p.b.webVitals.fcp ?? 0,
    },
    {
      name: "TTFB",
      unit: "ms",
      extractA: (p) => p.a.webVitals.ttfb ?? 0,
      extractB: (p) => p.b.webVitals.ttfb ?? 0,
    },
    {
      name: "JSHeapUsedSize delta",
      unit: "bytes",
      extractA: (p) => p.a.heapEnd - p.a.heapStart,
      extractB: (p) => p.b.heapEnd - p.b.heapStart,
    },
    {
      name: "DOM node delta",
      unit: "nodes",
      extractA: (p) => p.a.domCounters?.nodes ?? 0,
      extractB: (p) => p.b.domCounters?.nodes ?? 0,
    },
    {
      name: "Long task count",
      unit: "",
      extractA: (p) => p.a.longtasks.length,
      extractB: (p) => p.b.longtasks.length,
    },
    {
      name: "Long task total ms",
      unit: "ms",
      extractA: (p) =>
        p.a.longtasks.reduce((s, t) => s + (t.duration ?? 0), 0),
      extractB: (p) =>
        p.b.longtasks.reduce((s, t) => s + (t.duration ?? 0), 0),
    },
    {
      name: "Wall clock delta",
      unit: "ms",
      extractA: (p) => p.a.wallClockMs,
      extractB: (p) => p.b.wallClockMs,
    },
  ];

  return metricDefs.map((def) => {
    const aValues = pairs.map(def.extractA);
    const bValues = pairs.map(def.extractB);
    const aMed = median(aValues);
    const bMed = median(bValues);
    const deltaVal = bMed - aMed;
    const aIqrVal = iqr(aValues);

    return {
      name: def.name,
      unit: def.unit,
      aMedian: aMed,
      bMedian: bMed,
      delta: deltaVal,
      aP95: percentile95(aValues),
      bP95: percentile95(bValues),
      aIqr: aIqrVal,
      bIqr: iqr(bValues),
      significance: significanceLabel(deltaVal, aMed, aIqrVal),
    };
  });
}

// ── Report generation ────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${Math.round(bytes)}B`;
  if (Math.abs(bytes) < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatNum(val: number, unit: string): string {
  if (unit === "bytes") return formatBytes(val);
  if (unit === "") return val.toFixed(3);
  return `${Math.round(val * 100) / 100}${unit}`;
}

export function computeMetrics(
  report: BenchmarkReport,
): Record<ThrottleProfileName, MetricSummary[]> {
  const result: Record<string, MetricSummary[]> = {};
  for (const scenario of report.scenarios) {
    result[scenario.profile] = extractMetrics(scenario);
  }
  return result as Record<ThrottleProfileName, MetricSummary[]>;
}

export function generateMarkdown(report: BenchmarkReport): string {
  const env = report.environment;
  const metrics = computeMetrics(report);
  const e = escapeHtml;
  const ciTag = env.ciMode ? "[SHARED-RUNNER-SMOKE] " : "";

  const lines: string[] = [];

  // 1. Headline summary
  lines.push(`# ${ciTag}Faultsense Performance Benchmark Report`);
  lines.push("");

  const firstProfile = report.scenarios[0];
  if (firstProfile) {
    const m = metrics[firstProfile.profile];
    const lcp = m?.find((x) => x.name === "LCP");
    const heap = m?.find((x) => x.name === "JSHeapUsedSize delta");
    const lcpStr = lcp
      ? `LCP delta ${lcp.delta >= 0 ? "+" : ""}${Math.round(lcp.delta)}ms (${lcp.significance})`
      : "LCP: no data";
    const heapStr = heap
      ? `heap delta ${heap.delta >= 0 ? "+" : ""}${formatBytes(heap.delta)} (${heap.significance})`
      : "heap: no data";
    lines.push(
      `**faultsense ${e(env.agentVersion)}** on ${e(env.targetUrl)} ` +
        `(${firstProfile.profile}, ${env.pairsCount} pairs): ` +
        `${lcpStr}, ${heapStr}.`,
    );
    if (report.status === "aborted") {
      lines.push("");
      lines.push("> **Note:** This run was aborted early. Results are partial.");
    }
  }
  lines.push("");

  // 2. Environment
  lines.push("## Environment");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Machine | ${e(env.machine)} |`);
  lines.push(`| OS | ${e(env.os)} |`);
  lines.push(`| CPU | ${e(env.cpuModel)} (${env.cpuCores} cores) |`);
  lines.push(`| RAM | ${env.ramGB}GB |`);
  lines.push(`| Node | ${e(env.nodeVersion)} |`);
  lines.push(`| Playwright | ${e(env.playwrightVersion)} |`);
  lines.push(`| Chromium | ${e(env.chromiumRevision)} |`);
  lines.push(`| Agent version | ${e(env.agentVersion)} |`);
  lines.push(`| Agent commit | ${e(env.agentCommitSha)} |`);
  lines.push(`| Agent bundle SHA-256 | \`${e(env.agentBundleSha256)}\` |`);
  lines.push(`| Target URL | ${e(env.targetUrl)} |`);
  lines.push(`| Resolved IP | ${e(env.resolvedIp)} |`);
  lines.push(`| Timestamp (UTC) | ${e(env.timestamp)} |`);
  lines.push(`| Pairs (including 1 warmup) | ${env.pairsCount} |`);
  lines.push(`| Soak duration | ${env.soakMs / 1000}s |`);
  lines.push("");

  // 3. Headline table per profile
  for (const scenario of report.scenarios) {
    const profileMetrics = metrics[scenario.profile];
    if (!profileMetrics) continue;

    const profile = THROTTLE_PROFILES[scenario.profile];
    const profileLabel =
      scenario.profile === "unthrottled"
        ? "Unthrottled"
        : `Slow 4G (${profile.network?.latency}ms RTT, ${((profile.network?.downloadThroughput ?? 0) * 8 / 1_000_000).toFixed(1)}Mbps down)`;

    lines.push(`## Results: ${profileLabel}`);
    lines.push("");
    lines.push(
      `| Metric | A (without agent) | B (with agent) | Delta | Significance |`,
    );
    lines.push(`|---|---|---|---|---|`);

    for (const m of profileMetrics) {
      const aStr = formatNum(m.aMedian, m.unit);
      const bStr = formatNum(m.bMedian, m.unit);
      const deltaStr = `${m.delta >= 0 ? "+" : ""}${formatNum(m.delta, m.unit)}`;
      lines.push(
        `| ${e(m.name)} | ${aStr} (p95: ${formatNum(m.aP95, m.unit)}, IQR: ${formatNum(m.aIqr, m.unit)}) | ${bStr} (p95: ${formatNum(m.bP95, m.unit)}, IQR: ${formatNum(m.bIqr, m.unit)}) | ${deltaStr} | ${m.significance} |`,
      );
    }
    lines.push("");
  }

  // 4. Methodology
  lines.push("## Methodology");
  lines.push("");
  lines.push(
    "Each benchmark run launches a fresh Chromium instance per pair of measurements. " +
      "Within each pair, condition A (page without faultsense) and condition B (page with faultsense) " +
      "share the same browser process so V8 isolate noise cancels out in the differential.",
  );
  lines.push("");
  lines.push(
    `Runs are strict A-B-A-B interleaved. The first pair is discarded as JIT warmup, ` +
      `leaving ${env.pairsCount - 1} usable pairs. Each measurement navigates to the target URL, ` +
      `waits for \`load\`, then sits idle for ${env.soakMs / 1000}s (the "soak" window).`,
  );
  lines.push("");
  lines.push(
    "During the soak, the faultsense agent's internal 5s GC sweep runs ~" +
      `${Math.floor(env.soakMs / 5000)} times. This is legitimate agent work — the sweep checks for ` +
      "stale assertions and cleans up. It is not hidden or suppressed.",
  );
  lines.push("");
  lines.push(
    "Heap measurements use `Performance.getMetrics` (not `performance.memory` which would pollute " +
      "the target isolate). Two forced GCs (`HeapProfiler.collectGarbage`) run before each heap read " +
      "to promote young-gen survivors. CPU profiler sampling interval is set to 100\u00B5s (default 1ms " +
      "rounds microsecond-scale agent work to zero).",
  );
  lines.push("");
  lines.push(
    "Web Vitals (LCP, CLS, INP, FCP, TTFB) are captured via the `web-vitals` v4 library " +
      "injected alongside the instruments. Finalization is triggered explicitly via a synthetic " +
      "`visibilitychange` event, not a magic sleep.",
  );
  lines.push("");
  lines.push(
    "Network throttling is applied before navigation; CPU throttling is applied after navigation " +
      "(following the Lighthouse convention).",
  );
  lines.push("");

  // 5. Caveats
  lines.push("## Caveats");
  lines.push("");
  lines.push(
    "- This report measures **cold load + idle soak** only. Scripted user interactions are not included.",
  );
  lines.push(
    "- INP is a lab estimate in headless Chromium. Real-user INP requires actual interaction.",
  );
  lines.push(
    "- Results are Chromium-only. Firefox and Safari are not tested.",
  );
  lines.push(
    "- Pages behind authentication, bot challenges, or login redirects are not supported.",
  );
  lines.push(
    "- Numbers are hardware-dependent. Compare against the disclosed environment, or run the tool yourself on comparable hardware.",
  );
  if (env.ciMode) {
    lines.push(
      "- **This report was generated on a shared CI runner.** Numbers are not meaningful for procurement. Run locally on a quiet machine for credible results.",
    );
  }
  lines.push("");

  // 6. Raw data
  lines.push("## Raw Data");
  lines.push("");
  lines.push(
    "Full per-run measurements are available in the companion JSON file.",
  );
  lines.push("");

  return lines.join("\n");
}

export function generateJson(report: BenchmarkReport): string {
  const metrics = computeMetrics(report);
  // Strip CPU profiler data from JSON output — it's 100MB+ and not useful
  // in the published report. Raw profiler data can be captured by running
  // the tool locally.
  const stripped = {
    ...report,
    metrics,
    scenarios: report.scenarios.map((s) => ({
      ...s,
      pairs: s.pairs.map((p) => ({
        a: { ...p.a, profile: null },
        b: { ...p.b, profile: null },
      })),
      warmupPair: {
        a: { ...s.warmupPair.a, profile: null },
        b: { ...s.warmupPair.b, profile: null },
      },
    })),
  };
  return JSON.stringify(stripped, null, 2);
}
