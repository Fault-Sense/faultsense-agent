import type Protocol from "devtools-protocol";

// ── Window augmentation (scoped to benchmark tsconfig) ───────────────

declare global {
  interface Window {
    __fsBench: {
      longtasks: PerformanceEntry[];
      webVitals: WebVitalsResult;
      finalized: boolean;
    };
    Faultsense?: {
      init: (config: Record<string, unknown>) => void;
      cleanup: () => void;
    };
  }
}

// ── Web Vitals ───────────────────────────────────────────────────────

export interface WebVitalsResult {
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  ttfb?: number;
}

// ── Throttle profiles ────────────────────────────────────────────────

export interface NetworkConditions {
  offline: boolean;
  latency: number;
  downloadThroughput: number;
  uploadThroughput: number;
}

export interface ThrottleProfile {
  cpu: number;
  network: NetworkConditions | null;
}

export type ThrottleProfileName = "unthrottled" | "slow4g";

export const THROTTLE_PROFILES: Record<ThrottleProfileName, ThrottleProfile> = {
  unthrottled: { cpu: 1, network: null },
  slow4g: {
    cpu: 1,
    network: {
      offline: false,
      latency: 562.5,
      downloadThroughput: 180_000,
      uploadThroughput: 84_375,
    },
  },
} as const;

// ── Measurement ──────────────────────────────────────────────────────

export interface Measurement {
  condition: "A" | "B";
  heapStart: number;
  heapEnd: number;
  domCounters: Protocol.Memory.GetDOMCountersResponse;
  longtasks: PerformanceEntry[];
  webVitals: WebVitalsResult;
  profile: Protocol.Profiler.Profile | null;
  wallClockMs: number;
}

export interface PairResult {
  a: Measurement;
  b: Measurement;
}

export type ScenarioMode = "idle" | "active";

export interface ScenarioResult {
  profile: ThrottleProfileName;
  mode: ScenarioMode;
  pairs: PairResult[];
  warmupPair: PairResult;
}

// ── Scenario config ──────────────────────────────────────────────────

export interface ScenarioConfig {
  url: string;
  throttle: ThrottleProfile;
  profileName: ThrottleProfileName;
  mode: ScenarioMode;
  soakMs: number;
  pairsCount: number;
  agentPath: string;
  initWrapperPath: string;
  longtaskObserverPath: string;
  webVitalsIifePath: string;
  webVitalsCollectorPath: string;
  atRestScrubPath?: string;
  interactFn?: (page: import("@playwright/test").Page) => Promise<void>;
  resetUrl?: string;
}

// ── Environment info ─────────────────────────────────────────────────

export interface EnvironmentInfo {
  machine: string;
  os: string;
  cpuModel: string;
  cpuCores: number;
  ramGB: number;
  nodeVersion: string;
  playwrightVersion: string;
  chromiumRevision: string;
  agentVersion: string;
  agentCommitSha: string;
  agentBundleSha256: string;
  targetUrl: string;
  resolvedIp: string;
  timestamp: string;
  pairsCount: number;
  soakMs: number;
  ciMode: boolean;
}

// ── Report ───────────────────────────────────────────────────────────

export type SignificanceLabel = "within noise" | "measurable" | "significant";

export interface MetricSummary {
  name: string;
  unit: string;
  aMedian: number;
  bMedian: number;
  delta: number;
  aP95: number;
  bP95: number;
  aIqr: number;
  bIqr: number;
  significance: SignificanceLabel;
}

export interface BenchmarkReport {
  environment: EnvironmentInfo;
  scenarios: ScenarioResult[];
  metrics: Record<string, MetricSummary[]>;
  status: "complete" | "aborted";
}

// ── Error ────────────────────────────────────────────────────────────

export type BenchmarkErrorKind =
  | "invalid-url"
  | "ci-refused"
  | "missing-build"
  | "injection-failed"
  | "aborted";

export class BenchmarkError extends Error {
  constructor(
    public readonly kind: BenchmarkErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BenchmarkError";
  }
}
