// Custom collector function type
export type CollectorFunction = (payload: ApiPayload) => void;

export interface Configuration {
  apiKey: string;
  releaseLabel: string;
  gcInterval: number;
  unloadGracePeriod: number;
  collectorURL: string | CollectorFunction;
  debug: boolean;
}

// Converts HTMLElement into an Assertion;
export type ElementProcessor = (elements: HTMLElement[]) => Assertion[];
export type ElementResolver = (
  addedOrUpdatedElements: HTMLElement[],
  removedElements: HTMLElement[],
  updatedElements: HTMLElement[],
  assertions: Assertion[]
) => CompletedAssertion[];

export type EventProcessor = (
  event: Event,
  processor: ElementProcessor
) => Assertion[];
export type EventResolver = (
  event: Event,
  assertions: Assertion[]
) => CompletedAssertion[];
export type MutationProcessor = (
  mutationsList: MutationRecord[],
  processor: ElementProcessor
) => Assertion[];
export type MutationHandler<T> = (
  mutationsList: MutationRecord[],
  handler: ElementProcessor | ElementResolver
) => T[];

export interface ErrorInfo {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
}
export type GlobalErrorHandler = (errorInfo: ErrorInfo) => void;

// Handlers to scan active assertions and mark as completed
export type AssertionCollectionResolver = (
  activeAssertions: Assertion[],
  config: Configuration
) => CompletedAssertion[];
export type GlobalErrorResolver = (
  errorInfo: ErrorInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];

export type AssertionStatus = "passed" | "failed" | "dismissed";

export const domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"] as const;
export const eventAssertionTypes = ["emitted"] as const;
export const routeAssertionTypes = ["route"] as const;
export const sequenceAssertionTypes = ["after"] as const;
export const allAssertionTypes = [...domAssertionTypes, ...eventAssertionTypes, ...routeAssertionTypes, ...sequenceAssertionTypes] as const;
export type AssertionType = (typeof allAssertionTypes)[number];

export type AssertionModiferValue = string;

export const domModifiers = ["text-matches", "classlist", "attrs-match", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"] as const;
export type DomModifier = (typeof domModifiers)[number];
export type AssertionModifiers =
  | "mpa"
  | "timeout"
  | DomModifier;

export interface Assertion {
  assertionKey: string;
  elementSnapshot: string;
  mpa_mode: boolean;
  trigger: string;
  timeout: number;
  startTime: number;
  type: AssertionType;
  typeValue: string;
  conditionKey?: string;
  grouped?: boolean;
  oob?: boolean;
  endTime?: number;
  status?: AssertionStatus;
  statusReason?: string;
  modifiers: Partial<Record<AssertionModifiers, AssertionModiferValue>>;
  attempts?: number[];
  previousStartTime?: number;
  previousEndTime?: number;
  previousStatus?: AssertionStatus;
  previousStatusReason?: string;
  timeoutId?: ReturnType<typeof setTimeout>;
  invertResolution?: boolean;
}

export interface CompletedAssertion
  extends Omit<Assertion, "endTime" | "status"> {
  endTime: number;
  status: AssertionStatus;
}

export interface ApiPayload {
  api_key: string;
  assertion_key: string;
  assertion_trigger: string;
  assertion_type_value: string;
  assertion_type: AssertionType;
  assertion_type_modifiers: Partial<Record<AssertionModifiers, AssertionModiferValue>>;
  attempts: number[];
  condition_key: string;
  element_snapshot: string;
  release_label: string;
  status_reason: string;
  status: AssertionStatus;
  timestamp: string; // ISO String using start timestamp
}

// Global Faultsense object interface
declare global {
  interface Window {
    Faultsense?: {
      init?: (config: Partial<Configuration>) => () => void;
      cleanup?: () => void;
      collectors?: Record<string, CollectorFunction>;
      registerCleanupHook?: (fn: () => void) => void;
    };
  }
}