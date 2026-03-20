import {
  supportedAssertions,
  assertionPrefix,
  assertionTriggerAttr,
  responseConditionPattern,
  domAssertions,
} from "../config";
import type {
  Assertion,
  AssertionModiferValue,
  AssertionType,
  ElementProcessor,
} from "../types";

interface AssertionTypeEntry {
  type: string;
  value: string;
  modifiers?: Record<string, string>;
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
 * Parse dynamic assertion types from element attributes.
 * Decomposes compound attribute names (e.g., "fs-assert-resp-200-added")
 * into fully resolved type entries.
 */
function parseDynamicTypes(element: HTMLElement): AssertionTypeEntry[] {
  const prefix = assertionPrefix.types;
  const types: AssertionTypeEntry[] = [];

  for (const attr of Array.from(element.attributes)) {
    if (attr.name.startsWith(`${prefix}resp-`)) {
      const suffix = attr.name.slice(`${prefix}resp-`.length);
      const match = suffix.match(responseConditionPattern);
      if (match && domAssertions.includes(match[2])) {
        types.push({
          type: match[2],
          value: attr.value,
          modifiers: { "response-status": match[1] },
        });
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
        assertionMetaData.types.push({ type: key, value });
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

  if (!assertionMetadata.details["feature"]) {
    console.error("[Faultsense]: Missing 'fs-feature' on assertion.", details);
    return false;
  }

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

  return metadata.types.map((typeEntry) => {
    const mergedModifiers = typeEntry.modifiers
      ? { ...metadata.modifiers, ...typeEntry.modifiers }
      : metadata.modifiers;

    return {
      assertionKey: metadata.details["assert"],
      assertionLabel: metadata.details["assert-label"] || "",
      endTime: undefined,
      elementSnapshot: element.outerHTML,
      featureKey: metadata.details["feature"],
      featureLabel: metadata.details["feature-label"] || "",
      trigger: metadata.details.trigger,
      mpa_mode: Boolean(metadata.modifiers["mpa"]),
      startTime: Date.now(),
      status: undefined,
      statusReason: "",
      timeout: Number(metadata.modifiers["timeout"]) || 0,
      type: typeEntry.type as AssertionType,
      typeValue: typeEntry.value as string,
      modifiers: mergedModifiers,
      httpPending: typeEntry.modifiers ? true : undefined,
    };
  });
}
