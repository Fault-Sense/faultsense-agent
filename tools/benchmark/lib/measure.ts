import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import dns from "node:dns/promises";

// Debug progress — writes to a file to bypass Playwright's stdout buffering.
// Set FS_BENCH_DEBUG=1 to enable.
const DEBUG = !!process.env.FS_BENCH_DEBUG;
const DEBUG_FILE = path.resolve(os.tmpdir(), "fsbench-progress.log");
function debugLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  if (DEBUG) {
    fs.appendFileSync(DEBUG_FILE, line + "\n");
  }
}
import {
  type Measurement,
  type PairResult,
  type ScenarioConfig,
  type ScenarioResult,
  type EnvironmentInfo,
  type ThrottleProfileName,
  type BenchmarkReport,
  type WebVitalsResult,
  THROTTLE_PROFILES,
  BenchmarkError,
} from "./types";

// ── Pre-flight validation ────────────────────────────────────────────

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export function validateUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BenchmarkError("invalid-url", `Invalid URL: ${raw}`);
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new BenchmarkError(
      "invalid-url",
      `URL scheme "${parsed.protocol}" is not allowed. Use http: or https:.`,
    );
  }
  return parsed;
}

export function checkCiRefusal(allowCi: boolean): void {
  if ((process.env.CI || process.env.GITHUB_ACTIONS) && !allowCi) {
    throw new BenchmarkError(
      "ci-refused",
      "Benchmark tool refuses to run in CI without --allow-ci. " +
        "Shared-runner numbers are not meaningful for procurement. " +
        "Pass --allow-ci to override (report will be tagged).",
    );
  }
}

export function checkBuildArtifact(agentPath: string): void {
  if (!fs.existsSync(agentPath)) {
    throw new BenchmarkError(
      "missing-build",
      `Agent bundle not found at ${agentPath}. Run \`npm run build:agent\` first.`,
    );
  }
}

// ── CDP helpers ──────────────────────────────────────────────────────

async function readJSHeapUsedSize(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const heap = metrics.find((m) => m.name === "JSHeapUsedSize");
  return heap?.value ?? 0;
}

function isCdpTargetClosed(err: unknown): boolean {
  return err instanceof Error && /target closed/i.test(err.message);
}

// ── Single measurement ───────────────────────────────────────────────

async function runMeasurement(
  browser: Browser,
  config: ScenarioConfig,
  condition: "A" | "B",
  signal: AbortSignal,
): Promise<Measurement> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  try {
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });

    // Network throttle BEFORE navigation (Lighthouse convention)
    if (config.throttle.network) {
      await cdp.send(
        "Network.emulateNetworkConditions",
        config.throttle.network,
      );
    }

    // Install shared instruments (both conditions)
    await page.addInitScript({ path: config.longtaskObserverPath });
    await page.addInitScript({ path: config.webVitalsIifePath });
    await page.addInitScript({ path: config.webVitalsCollectorPath });

    // Demo mode: at-rest scrub strips fs-* attributes before agent sees them
    if (config.atRestScrubPath) {
      await page.addInitScript({ path: config.atRestScrubPath });
    }

    if (condition === "B") {
      await page.addInitScript({ path: config.agentPath });
      await page.addInitScript({ path: config.initWrapperPath });
    }

    if (signal.aborted) throw new BenchmarkError("aborted", "Aborted");

    const navStart = Date.now();
    await page.goto(config.url, { waitUntil: "load" });

    // CPU throttle AFTER navigation (Lighthouse convention)
    if (config.throttle.cpu > 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", {
        rate: config.throttle.cpu,
      });
    }

    // Baseline heap — two GCs back-to-back (young-gen survivors need two passes)
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const heapStart = await readJSHeapUsedSize(cdp);

    await cdp.send("Profiler.start");

    // Idle soak
    debugLog(`    [${condition}] soaking ${config.soakMs}ms...`);
    await page.waitForTimeout(config.soakMs);

    if (signal.aborted) throw new BenchmarkError("aborted", "Aborted");

    const profileResult = await cdp
      .send("Profiler.stop")
      .catch((err) => (isCdpTargetClosed(err) ? { profile: null } : Promise.reject(err)));

    // End-of-soak heap — two GCs again
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const heapEnd = await readJSHeapUsedSize(cdp);
    const domCounters = await (cdp.send as Function)("Memory.getDOMCounters") as
      import("devtools-protocol").Protocol.Memory.GetDOMCountersResponse;

    const longtasks = await page.evaluate(() => window.__fsBench.longtasks);

    // Force web-vitals finalization via explicit visibility change.
    // We dispatch visibilitychange to trigger web-vitals v4 finalization,
    // then wait a fixed 500ms for callbacks to fire. Using waitForFunction
    // here hangs in some Playwright + headless-shell configurations.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);
    const webVitals: WebVitalsResult = await page.evaluate(
      () => window.__fsBench.webVitals,
    );
    debugLog(`    [${condition}] done (${Date.now() - navStart}ms)`);

    const wallClockMs = Date.now() - navStart;

    await page.close({ runBeforeUnload: true }).catch(() => {});
    await context.close().catch(() => {});

    return {
      condition,
      heapStart,
      heapEnd,
      domCounters,
      longtasks,
      webVitals,
      profile: profileResult?.profile ?? null,
      wallClockMs,
    };
  } catch (err) {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    throw err;
  }
}

// ── Paired measurement ───────────────────────────────────────────────

async function runPair(
  config: ScenarioConfig,
  pairIndex: number,
  signal: AbortSignal,
): Promise<PairResult> {
  // Fresh browser per pair — A+B share a V8 isolate within the pair,
  // fresh between pairs (isolation). Halves launch overhead.
  const browser = await chromium.launch({ headless: true });
  try {
    const a = await runMeasurement(browser, config, "A", signal);
    const b = await runMeasurement(browser, config, "B", signal);
    return { a, b };
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── Post-navigation sanity check ─────────────────────────────────────

async function checkInjection(page: Page): Promise<void> {
  const hasFaultsense = await page.evaluate(
    () => typeof window.Faultsense !== "undefined",
  );
  if (!hasFaultsense) {
    throw new BenchmarkError(
      "injection-failed",
      "Faultsense agent was not detected after injection. " +
        "Likely causes: CSP blocking inline scripts, or the bundle failed to load. " +
        "Check the target page's Content-Security-Policy headers.",
    );
  }
}

// ── Orchestration ────────────────────────────────────────────────────

export interface RunOptions {
  url: string;
  pairsCount?: number;
  soakMs?: number;
  allowCi?: boolean;
  isDemo?: boolean;
}

export async function runBenchmark(
  options: RunOptions,
): Promise<BenchmarkReport> {
  const {
    url: rawUrl,
    pairsCount = 10,
    soakMs = 60_000,
    allowCi = false,
    isDemo = false,
  } = options;

  // Pre-flight
  const parsedUrl = validateUrl(rawUrl);
  checkCiRefusal(allowCi);

  const rootDir = path.resolve(__dirname, "../../..");
  const agentPath = path.resolve(rootDir, "dist/faultsense-agent.min.js");
  checkBuildArtifact(agentPath);

  const injectionDir = path.resolve(__dirname, "injection");

  // SIGINT handling
  const abortController = new AbortController();
  const signal = abortController.signal;
  let aborted = false;

  const sigintHandler = () => {
    aborted = true;
    abortController.abort();
  };
  process.on("SIGINT", sigintHandler);

  const scenarios: ScenarioResult[] = [];
  const profiles: ThrottleProfileName[] = ["unthrottled", "slow4g"];

  try {
    for (const profileName of profiles) {
      if (signal.aborted) break;

      const config: ScenarioConfig = {
        url: parsedUrl.href,
        throttle: THROTTLE_PROFILES[profileName],
        profileName,
        soakMs,
        pairsCount,
        agentPath,
        initWrapperPath: path.resolve(injectionDir, "init-wrapper.js"),
        longtaskObserverPath: path.resolve(injectionDir, "longtask-observer.js"),
        webVitalsIifePath: path.resolve(
          rootDir,
          "node_modules/web-vitals/dist/web-vitals.iife.js",
        ),
        webVitalsCollectorPath: path.resolve(
          injectionDir,
          "web-vitals-collector.js",
        ),
        ...(isDemo
          ? {
              atRestScrubPath: path.resolve(injectionDir, "at-rest-scrub.js"),
            }
          : {}),
      };

      const pairs: PairResult[] = [];
      let warmupPair: PairResult | null = null;

      for (let i = 0; i < pairsCount; i++) {
        if (signal.aborted) break;

        console.log(
          `  [${profileName}] Pair ${i + 1}/${pairsCount}${i === 0 ? " (warmup)" : ""}`,
        );
        const pair = await runPair(config, i, signal);

        // Post-nav sanity check on first B measurement of the first profile
        if (i === 0 && profileName === profiles[0]) {
          const browser = await chromium.launch({ headless: true });
          try {
            const ctx = await browser.newContext();
            const page = await ctx.newPage();
            await page.addInitScript({ path: agentPath });
            await page.addInitScript({ path: config.initWrapperPath });
            await page.goto(parsedUrl.href, { waitUntil: "load" });
            await checkInjection(page);
            await page.close().catch(() => {});
            await ctx.close().catch(() => {});
          } finally {
            await browser.close().catch(() => {});
          }
        }

        if (i === 0) {
          warmupPair = pair;
        } else {
          pairs.push(pair);
        }
      }

      scenarios.push({
        profile: profileName,
        pairs,
        warmupPair: warmupPair!,
      });
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
  }

  const env = await gatherEnvironment(
    parsedUrl,
    agentPath,
    rootDir,
    pairsCount,
    soakMs,
    allowCi,
  );

  return {
    environment: env,
    scenarios,
    metrics: {} as BenchmarkReport["metrics"],
    status: aborted ? "aborted" : "complete",
  };
}

// ── Environment gathering ────────────────────────────────────────────

async function gatherEnvironment(
  parsedUrl: URL,
  agentPath: string,
  rootDir: string,
  pairsCount: number,
  soakMs: number,
  ciMode: boolean,
): Promise<EnvironmentInfo> {
  const agentBundle = fs.readFileSync(agentPath);
  const sha256 = crypto.createHash("sha256").update(agentBundle).digest("hex");

  let commitSha = "unknown";
  try {
    commitSha = execSync("git rev-parse --short HEAD", {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    // not a git repo or git not available
  }

  let agentVersion = "unknown";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "package.json"), "utf-8"),
    );
    agentVersion = pkg.version;
  } catch {
    // ignore
  }

  let resolvedIp = "unknown";
  try {
    const addrs = await dns.resolve4(parsedUrl.hostname);
    resolvedIp = addrs[0] ?? "unknown";
  } catch {
    // DNS resolution failed
  }

  let playwrightVersion = "unknown";
  try {
    const pwPkg = JSON.parse(
      fs.readFileSync(
        path.resolve(rootDir, "node_modules/@playwright/test/package.json"),
        "utf-8",
      ),
    );
    playwrightVersion = pwPkg.version;
  } catch {
    // ignore
  }

  let chromiumRevision = "unknown";
  try {
    const browser = await chromium.launch({ headless: true });
    chromiumRevision = browser.version();
    await browser.close();
  } catch {
    // ignore
  }

  const cpus = os.cpus();

  return {
    machine: os.hostname(),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    ramGB: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
    nodeVersion: process.version,
    playwrightVersion,
    chromiumRevision,
    agentVersion,
    agentCommitSha: commitSha,
    agentBundleSha256: sha256,
    targetUrl: parsedUrl.href,
    resolvedIp,
    timestamp: new Date().toISOString(),
    pairsCount,
    soakMs,
    ciMode,
  };
}
