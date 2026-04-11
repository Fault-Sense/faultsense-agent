/**
 * TypeScript declarations for scenarios.js — the shared scenario
 * registry imported by both generate-matrix.js (Node CJS) and the
 * Playwright drivers (TypeScript). Written as a sidecar .d.ts so the
 * runtime module stays untyped CommonJS and the consumers of the
 * module stay fully typed.
 */

export interface ScenarioMeta {
  key: string;
  title: string;
  pats: string[];
}

export declare const SCENARIOS: readonly ScenarioMeta[];
export declare const SCENARIO_KEYS: ReadonlySet<string>;
export declare const SCENARIO_TO_PAT: Readonly<Record<string, string[]>>;
export declare function requireScenario(key: string): ScenarioMeta;
