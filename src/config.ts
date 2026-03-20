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

// Status suffix pattern for response-conditional types: added-200, removed-4xx
export const statusSuffixPattern = /^(\d{3}|\d{1}xx)$/;

// Reserved inline modifier keys (everything else is treated as an attribute check)
export const inlineModifiers = ["text-matches", "classlist"];
export const httpResponseHeaderKey = "fs-resp-for";

export const supportedAssertions = {
  details: [
    "assert",
    "trigger",
  ],
  types: [...domAssertions],
  modifiers: [
    "mpa",
    "timeout",
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
