import {
  supportedAssertions,
  assertionPrefix,
  assertionTriggerAttr,
  conditionKeySuffixPattern,
  reservedConditionKeys,
  inlineModifiers,
  supportedModifiersByType,
  invertedResolutionTypes,
} from "../config";
import { parseRoutePattern, validateRoutePattern } from "../resolvers/route";
import {
  allAssertionTypes,
  type Assertion,
  type AssertionModiferValue,
  type AssertionType,
  type ElementProcessor,
} from "../types";

interface AssertionTypeEntry {
  type: string;
  value: string;
  modifiers?: Record<string, string>;
  conditionKey?: string;
}

interface ElementAssertionMetadata {
  details: Record<string, string>;
  types: AssertionTypeEntry[];
  modifiers: Record<string, AssertionModiferValue>;
}

export class AssertionError extends Error {
  public details: Record<string, any>;

  constructor(message: string, details: Record<string, any>) {
    super(message);
    this.name = "AssertionError";
    this.details = details;
  }
}

/**
 * Parse a type attribute value into a selector and inline modifiers.
 * Format: "selector[key=value][key=value]..."
 * Handles nested brackets in values (e.g., regex character classes like [a-z])
 */
export function parseTypeValue(raw: string): { selector: string; modifiers: Record<string, string> } {
  const firstBracket = raw.indexOf('[');
  if (firstBracket === -1) {
    return { selector: raw, modifiers: {} };
  }

  const selector = raw.slice(0, firstBracket);
  const modifiers: Record<string, string> = {};

  // Walk the string character by character to handle nested brackets
  let i = firstBracket;
  while (i < raw.length) {
    if (raw[i] !== '[') { i++; continue; }

    // Find the key (up to '=')
    const eqIndex = raw.indexOf('=', i + 1);
    if (eqIndex === -1) break;
    const key = raw.slice(i + 1, eqIndex);

    // Find the matching closing bracket, tracking nesting depth
    let depth = 1;
    let j = eqIndex + 1;
    while (j < raw.length && depth > 0) {
      if (raw[j] === '[') depth++;
      else if (raw[j] === ']') depth--;
      if (depth > 0) j++;
    }

    if (depth === 0) {
      modifiers[key] = raw.slice(eqIndex + 1, j);
      i = j + 1;
    } else {
      break;
    }
  }

  return { selector, modifiers };
}

/**
 * Resolve inline modifiers to the format resolvers expect.
 * Reserved keys (text-matches, classlist) pass through.
 * Unreserved keys become attrs-match entries.
 */
export function resolveInlineModifiers(
  inlineMods: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const attrChecks: Record<string, string> = {};

  for (const [key, value] of Object.entries(inlineMods)) {
    if (inlineModifiers.includes(key)) {
      resolved[key] = value;
    } else {
      attrChecks[key] = value;
    }
  }

  // Convert classlist from "active:true,hidden:false" to JSON
  if (resolved["classlist"]) {
    const classMap: Record<string, boolean> = {};
    for (const pair of resolved["classlist"].split(",")) {
      const [cls, val] = pair.split(":");
      classMap[cls.trim()] = val.trim() === "true";
    }
    resolved["classlist"] = JSON.stringify(classMap);
  }

  // Convert attribute checks to attrs-match JSON
  if (Object.keys(attrChecks).length > 0) {
    resolved["attrs-match"] = JSON.stringify(attrChecks);
  }

  return resolved;
}

/**
 * Parse dynamic assertion types from element attributes.
 * Matches: fs-assert-{knownType}-{conditionKey} (e.g., fs-assert-added-success)
 * Condition keys are freeform lowercase alphanumeric strings with hyphens.
 */
function parseDynamicTypes(element: HTMLElement): AssertionTypeEntry[] {
  const prefix = assertionPrefix.types;
  const types: AssertionTypeEntry[] = [];

  for (const attr of Array.from(element.attributes)) {
    if (!attr.name.startsWith(prefix)) continue;
    const suffix = attr.name.slice(prefix.length);

    for (const domType of allAssertionTypes) {
      if (suffix.startsWith(`${domType}-`)) {
        const remaining = suffix.slice(domType.length + 1);

        if (conditionKeySuffixPattern.test(remaining)) {
          if (reservedConditionKeys.includes(remaining)) {
            console.warn(
              `[Faultsense]: Condition key "${remaining}" conflicts with a reserved name. Avoid using assertion type names as condition keys.`,
              { element }
            );
          }
          const { selector, modifiers } = parseTypeValue(attr.value);
          types.push({
            type: domType,
            value: selector,
            modifiers,
            conditionKey: remaining,
          });
        }
        break;
      }
    }
  }

  return types;
}

export function createElementProcessor(triggers: string[], eventMode: boolean = false): ElementProcessor {
  return function (targets: HTMLElement[]): Assertion[] {
    return processElements(targets, triggers, eventMode);
  };
}

export function processElements(
  targets: HTMLElement[],
  triggers: string[],
  eventMode: boolean = false
): Assertion[] {
  const allAssertions: Assertion[] = [];

  // Process each target container
  for (const target of targets) {
    const elementsToProcess: HTMLElement[] = [];

    // Check if the target element itself is processable
    if (isProcessableElement(target, triggers)) {
      elementsToProcess.push(target);
    } else if (!eventMode) {
      // Only search descendants if NOT in event mode
      // In event mode, we only process the exact clicked element
      const elementsWithTriggers = target.querySelectorAll(`[${assertionTriggerAttr}]`);

      // Add all descendant elements with trigger attributes (filter them too)
      for (const element of Array.from(elementsWithTriggers) as HTMLElement[]) {
        if (isProcessableElement(element, triggers)) {
          elementsToProcess.push(element);
        }
      }
    }

    // Process each element that has assertion attributes
    for (const element of elementsToProcess) {
      const assertionMetadata = parseAssertions(element);
      const newAssertions = createAssertions(element, assertionMetadata);
      allAssertions.push(...newAssertions);
    }
  }

  return allAssertions;
}

/**
 * Quick way to determine if this is a faultsense processable element
 */
function isProcessableElement(
  element: HTMLElement,
  triggers: string[]
): boolean {
  if (element.hasAttribute(assertionTriggerAttr)) {
    return triggers.includes(
      element.getAttribute(assertionTriggerAttr) as string
    );
  }
  return false;
}

/**
 * Returns the assertion metadata from an element
 * Defers casting assertion values until they are used
 */
function parseAssertions(element: HTMLElement): ElementAssertionMetadata {
  let assertionMetaData: ElementAssertionMetadata = {
    details: {},
    types: [],
    modifiers: {},
  };

  const processDetails = (keys: string[]): void => {
    for (const key of keys) {
      const value = element.getAttribute(`${assertionPrefix.details}${key}`);
      if (value !== null) {
        assertionMetaData.details[key] = value;
      }
    }
  };

  const processTypes = (keys: string[]): void => {
    for (const key of keys) {
      const value = element.getAttribute(`${assertionPrefix.types}${key}`);
      if (value !== null) {
        const parsed = parseTypeValue(value);
        assertionMetaData.types.push({
          type: key,
          value: parsed.selector,
          modifiers: Object.keys(parsed.modifiers).length > 0 ? parsed.modifiers : undefined,
        });
      }
    }
  };

  const processModifiers = (keys: string[]): void => {
    for (const key of keys) {
      const value = element.getAttribute(`${assertionPrefix.modifiers}${key}`);
      if (value !== null) {
        assertionMetaData.modifiers[key] = value;
      }
    }
  };

  processDetails(supportedAssertions.details);
  processTypes(supportedAssertions.types);
  processModifiers(supportedAssertions.modifiers);

  assertionMetaData.types.push(...parseDynamicTypes(element));

  return assertionMetaData;
}

function isValidAssertionMetadata(
  assertionMetadata: ElementAssertionMetadata,
  element: HTMLElement
): boolean {
  const details = { element };

  if (!assertionMetadata.details["assert"]) {
    console.error(
      "[Faultsense]: Missing 'fs-assert' on assertion.",
      details
    );
    return false;
  }

  if (assertionMetadata.types.length === 0) {
    console.error("[Faultsense]: An assertion type must be provided.", details);
    return false;
  }

  return true;
}

function createAssertions(
  element: HTMLElement,
  metadata: ElementAssertionMetadata
): Assertion[] {
  if (!isValidAssertionMetadata(metadata, element)) {
    return [];
  }

  return metadata.types.filter((typeEntry) => {
    if (typeEntry.type === "route") {
      // Route assertions require a pattern
      if (!typeEntry.value) {
        console.warn(
          `[Faultsense]: Route assertion on "${metadata.details["assert"]}" has no pattern. Skipping.`
        );
        return false;
      }
      // Validate all regex parts of the route pattern at parse time
      const parsed = parseRoutePattern(typeEntry.value);
      const invalid = validateRoutePattern(parsed);
      if (invalid) {
        console.warn(
          `[Faultsense]: Invalid route pattern on "${metadata.details["assert"]}": ${invalid}. Skipping.`
        );
        return false;
      }
    }
    return true;
  }).map((typeEntry) => {
    // Route assertions have no inline modifiers — everything is in the URL pattern.
    // DOM assertions use resolveInlineModifiers to handle text-matches, classlist, attrs-match.
    const resolvedMods = typeEntry.modifiers
      ? (typeEntry.type === "route" ? typeEntry.modifiers : resolveInlineModifiers(typeEntry.modifiers))
      : {};
    const mergedModifiers = { ...metadata.modifiers, ...resolvedMods };

    // Warn about unsupported modifiers for this assertion type
    const allowedMods = supportedModifiersByType[typeEntry.type];
    if (allowedMods) {
      for (const mod of Object.keys(resolvedMods)) {
        if (!allowedMods.includes(mod)) {
          console.warn(
            `[Faultsense]: Modifier "${mod}" does not apply to "${typeEntry.type}" assertions. Found on "${metadata.details["assert"]}".`
          );
        }
      }
    }

    // Warn about count modifiers on self-referencing assertions (no selector)
    const hasCountMod = resolvedMods["count"] || resolvedMods["count-min"] || resolvedMods["count-max"];
    if (hasCountMod && !typeEntry.value) {
      console.warn(
        `[Faultsense]: Count modifier on self-referencing assertion "${metadata.details["assert"]}" is nonsensical (count is always 1).`
      );
    }

    return {
      assertionKey: metadata.details["assert"],
      endTime: undefined,
      elementSnapshot: element.outerHTML,
      trigger: metadata.details.trigger,
      mpa_mode: Boolean(metadata.modifiers["mpa"]),
      startTime: Date.now(),
      status: undefined,
      statusReason: "",
      timeout: Number(metadata.modifiers["timeout"]) || 0,
      type: typeEntry.type as AssertionType,
      typeValue: typeEntry.value as string,
      modifiers: mergedModifiers,
      conditionKey: typeEntry.conditionKey,
      grouped: typeEntry.conditionKey ? metadata.modifiers["grouped"] !== undefined : undefined,
      invertResolution: invertedResolutionTypes.includes(typeEntry.type) || undefined,
    };
  });
}
