// Custom collector function type
export type CollectorFunction = (payload: ApiPaylaod) => void;

export interface Configuration {
  apiKey: string;
  releaseLabel: string;
  timeout: number;
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
export interface RequestInfo {
  url: string;
  params?: any;
  headers: Record<string, string>;
}
export interface ResponseInfo {
  status: number;
  responseText: string;
  responseHeaders?: Record<string, string>;
}
export interface HttpErrorInfo {
  message: string;
  status: number;
  responseText: string;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  url: string;
}

export type GlobalErrorHandler = (errorInfo: ErrorInfo) => void;
export type HttpResponseHandler = (
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo
) => void;
export type HttpErrorHandler = (errorInfo: HttpErrorInfo) => void;

// Handlers to scan active assertions and mark as completed
export type AssertionCollectionResolver = (
  activeAssertions: Assertion[],
  config: Configuration
) => CompletedAssertion[];
export type HttpResponseResolver = (
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];
export type HttpErrorResolver = (
  errorInfo: HttpErrorInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];
export type GlobalErrorResolver = (
  errorInfo: ErrorInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];

export type AssertionStatus = "passed" | "failed";
export type AssertionType =
  | "added"
  | "removed"
  | "updated"
  | "visible"
  | "hidden"
  | "loaded"
  | "response-headers"
  | "response-status";

export type AssertionModiferValue = string;
export type AssertionModifiers =
  | "mpa"
  | "timeout"
  | "text-matches"
  | "attrs-match"
  | "classlist";

export interface Assertion {
  featureKey: string;
  featureLabel: string;
  assertionKey: string;
  assertionLabel: string;
  elementSnapshot: string;
  mpa_mode: boolean;
  trigger: string;
  timeout: number;
  startTime: number;
  type: AssertionType;
  typeValue: string;
  endTime?: number;
  status?: AssertionStatus;
  statusReason?: string;
  modifiers: Record<AssertionModifiers, AssertionModiferValue>;
  previousStartTime?: number;
  previousEndTime?: number;
  previousStatus?: AssertionStatus;
  previousStatusReason?: string;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export interface CompletedAssertion
  extends Omit<Assertion, "endTime" | "status"> {
  endTime: number;
  status: AssertionStatus;
}

export interface ApiPaylaod {
  assertion_key: string;
  assertion_label: string;
  assertion_trigger: string;
  assertion_type_value: string;
  assertion_type: AssertionType;
  assertion_type_modifiers: Record<AssertionModifiers, AssertionModiferValue>;
  element_snapshot: string;
  feature_key: string;
  feature_label: string;
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
      collectors?: {
        consoleCollector: CollectorFunction;
      };
    };
  }
}