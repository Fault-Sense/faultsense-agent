import { AssertionType, Configuration, domAssertionTypes, routeAssertionTypes, sequenceAssertionTypes, allAssertionTypes, domModifiers } from "./types";

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
export const sequenceAssertions: string[] = [...sequenceAssertionTypes];

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
  after: [],
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
  "mouseenter",
  "focusin",
  "input",
  "keydown",
];

/** Maps developer-facing trigger names to actual DOM event names */
export const triggerEventMap: Record<string, string> = {
  hover: "mouseenter",
  focus: "focusin",
};

// Derived: invert triggerEventMap for runtime lookup in handleEvent.
// When a DOM event fires, these are the trigger names to match against fs-trigger values.
export const eventTriggerAliases: Record<string, string[]> = {
  // error DOM event on media elements should also process load-triggered assertions
  error: ["error", "load"],
};
for (const [trigger, event] of Object.entries(triggerEventMap)) {
  if (!eventTriggerAliases[event]) eventTriggerAliases[event] = [event];
  eventTriggerAliases[event].push(trigger);
}

export const supportedTriggers = ["mount", "unmount", "invariant", "online", "offline", "hover", "focus", ...supportedEvents];
export const storageKey = "faultsense-active-assertions";
