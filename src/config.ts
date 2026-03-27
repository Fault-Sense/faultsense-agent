import { Configuration } from "./types";

export const defaultConfiguration: Partial<Configuration> = {
  gcInterval: 30000,
  unloadGracePeriod: 2000,
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

export const routeAssertions = ["route"];

// All assertion types for condition key parsing (parseDynamicTypes iterates this)
export const allAssertionTypes = [...domAssertions, ...routeAssertions];

// Condition key suffix pattern for UI-conditional types: added-success, added-error
export const conditionKeySuffixPattern = /^[a-z][a-z0-9-]*$/;

// Reserved condition keys that cannot be used (conflict with assertion type names)
export const reservedConditionKeys = [...allAssertionTypes, "oob"];

// Supported modifiers per assertion type (for generic validation)
export const supportedModifiersByType: Record<string, string[]> = {
  added: ["text-matches", "classlist"],
  removed: ["text-matches", "classlist"],
  updated: ["text-matches", "classlist"],
  visible: ["text-matches", "classlist"],
  hidden: ["text-matches", "classlist"],
  loaded: [],
  route: ["search", "hash"],
};

// OOB (out-of-band) assertion attribute prefix: fs-assert-oob-{type}
export const oobPrefix = `${assertionPrefix.types}oob-`;

// Reserved inline modifier keys (everything else is treated as an attribute check)
export const inlineModifiers = ["text-matches", "classlist"];

export const supportedAssertions = {
  details: [
    "assert",
    "trigger",
  ],
  types: [...allAssertionTypes],
  modifiers: [
    "mpa",
    "timeout",
    "grouped",
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

export const supportedTriggers = ["mount", "unmount", "invariant", ...supportedEvents];
export const storageKey = "faultsense-active-assertions";
