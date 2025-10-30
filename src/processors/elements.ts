import {
  supportedAssertions,
  assertionPrefix,
  assertionTriggerAttr,
} from "../config";
import type {
  Assertion,
  AssertionModiferValue,
  AssertionType,
  ElementProcessor,
} from "../types";

export interface ElementAssertionMetadata {
  details: Record<string, string>;
  types: Record<string, number | string | boolean>;
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
      console.log(assertionMetadata)
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
 * Returns the assertion metadta from an element
 * Defers casting assertion values until they are used
 */
export function parseAssertions(element: HTMLElement): ElementAssertionMetadata {
  let assertionMetaData: ElementAssertionMetadata = {
    details: {},
    types: {},
    modifiers: {},
  };

  const process = (
    keys: string[],
    assertions: ElementAssertionMetadata,
    section: "details" | "types" | "modifiers"
  ): ElementAssertionMetadata => {
    return keys.reduce((acc, key) => {
      const attributeValue = element.getAttribute(
        `${assertionPrefix[section]}${key}`
      );
      if (attributeValue !== null) {
        acc[section][key] = attributeValue;
      }
      return acc;
    }, assertions);
  };

  assertionMetaData = process(
    supportedAssertions.details,
    assertionMetaData,
    "details"
  );
  assertionMetaData = process(
    supportedAssertions.types,
    assertionMetaData,
    "types"
  );
  assertionMetaData = process(
    supportedAssertions.modifiers,
    assertionMetaData,
    "modifiers"
  );
  return assertionMetaData;
}

function isValidAssertionMetadata(
  assertionMetadata: ElementAssertionMetadata,
  element: HTMLElement
): boolean {
  const details = { element };

  if (!assertionMetadata.details["feature"]) {
    console.error("[Faultsense]: Missing 'fs-feature' on assertion.", details);
    return false; // Return false to indicate the validation failed
  }

  if (!assertionMetadata.details["assert"]) {
    console.error(
      "[Faultsense]: Missing 'fs-assert' on assertion.",
      details
    );
    return false;
  }

  // we only parse valid assertion types
  // invalid assertion types are ignored
  const assertionTypes = Object.keys(assertionMetadata.types);
  if (assertionTypes.length === 0) {
    console.error("[Faultsense]: An assertion type must be provided.", details);
    return false;
  } else {
    // TODO implement a more scabalbe way to validate assertion types/modifiers
    if (assertionTypes.includes("response-headers")) {
      try {
        const parsed = JSON.parse(
          assertionMetadata.types["response-headers"] as string
        );
        const isValidObject =
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed);
        if (!isValidObject) {
          console.error(
            "[Faultsense]: 'response-headers' must be a valid JSON object.",
            details
          );
          return false;
        }
      } catch (e) {
        console.error(
          "[Faultsense]: 'response-headers' must be a valid JSON object.",
          details
        );
        return false;
      }
    }
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

  return Object.keys(metadata.types).map((assertionType) => {
    return {
      assertionKey: metadata.details["assert"],
      assertionLabel: metadata.details["assert-label"] || "",
      endTime: undefined,
      elementSnapshot: element.outerHTML,
      featureKey: metadata.details["feature"],
      featureLabel: metadata.details["feature-label"] || "",
      trigger: metadata.details.trigger,
      type: assertionType as AssertionType,
      mpa_mode: Boolean(metadata.modifiers["mpa"]),
      typeValue: metadata.types[assertionType] as string,
      startTime: Date.now(),
      status: undefined,
      statusReason: "",
      timeout: Number(metadata.modifiers["timeout"]) || 0,
      modifiers: metadata.modifiers,
    };
  });
}