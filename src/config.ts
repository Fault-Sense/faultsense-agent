import { Configuration } from "./types";

export const defaultConfiguration: Partial<Configuration> = {
  timeout: 1000,
  collectorURL: "//faultsense.com/collector/",
  debug: false,
};

export const assertionPrefix = {
  details: "fs-",
  types: "fs-assert-",
  modifiers: "fs-assert-",
};
export const assertionTriggerAttr = `${assertionPrefix.details}trigger`;

export const domAssertions = [
  "added",
  "removed",
  "updated",
  "visible",
  "hidden",
  "loaded",
];

// Pattern: resp-{status}-{domType} where status is exact (200) or range (2xx)
export const responseConditionPattern = /^(\d{1}xx|\d{3})-(.+)$/;
export const httpResponseHeaderKey = "fs-resp-for";

export const supportedAssertions = {
  details: [
    "feature",
    "feature-label",
    "assert",
    "assert-label",
    "trigger",
  ],
  types: [...domAssertions],
  modifiers: [
    "mpa",
    "timeout",
    "text-matches",
    "attrs-match",
    "classlist",
  ],
};

export const supportedEvents = [
  "click",
  "dblclick",
  "change",
  "blur",
  "submit",
  "load",
  "error",
  // "mouseover",
  // "mouseout",
  // "focus",
  // "input",
  // "keydown",
  // "keyup",
  // "keypress",
  // "mouseenter",
  // "mouseleave",
];

/** Alias the event type to the list of other event types */
export const eventTriggerAliases: Record<string, string[]> = {
  error: ["load"],
};

export const supportedTriggers = ["mount", "unmount", ...supportedEvents];
export const storageKey = "faultsense-active-assertions";
