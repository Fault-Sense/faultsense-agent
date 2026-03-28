import { AssertionType, Configuration, domAssertionTypes, routeAssertionTypes, allAssertionTypes, domModifiers } from "./types";

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

// Re-export for use in resolvers/processors that gate on DOM vs route
export const domAssertions: string[] = [...domAssertionTypes];
export const routeAssertions: string[] = [...routeAssertionTypes];

// Condition key suffix pattern for UI-conditional types: added-success, added-error
export const conditionKeySuffixPattern = /^[a-z][a-z0-9-]*$/;

// Reserved condition keys that cannot be used (conflict with assertion type names)
export const reservedConditionKeys: string[] = [...allAssertionTypes, "oob", "oob-fail"];

// Supported modifiers per assertion type (for generic validation).
// Record<AssertionType, ...> ensures a compile error if a new type is added without updating this map.
export const supportedModifiersByType: Record<AssertionType, readonly string[]> = {
  added: domModifiers,
  removed: domModifiers,
  updated: domModifiers,
  visible: domModifiers,
  hidden: domModifiers,
  stable: domModifiers,
  loaded: [],
  route: [],
};

// Assertion types whose pass/fail resolution semantics are inverted.
// For these types, completeAssertion flips the success boolean.
export const invertedResolutionTypes: string[] = ["stable"];

// OOB (out-of-band) assertion attributes
export const oobAttr = `${assertionPrefix.types}oob`;         // fs-assert-oob (fires on parent pass)
export const oobFailAttr = `${assertionPrefix.types}oob-fail`; // fs-assert-oob-fail (fires on parent fail)

// Reserved inline modifier keys (everything else is treated as an attribute check)
export const inlineModifiers = ["text-matches", "classlist", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"];

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

export const supportedTriggers = ["mount", "unmount", "invariant", "online", "offline", ...supportedEvents];
export const storageKey = "faultsense-active-assertions";
