import { completeAssertion } from "../assertions/assertion";
import { domAssertions } from "../config";
import {
  Assertion,
  AssertionModifiers,
  AssertionType,
  CompletedAssertion,
  ElementResolver,
  AssertionCollectionResolver,
} from "../types";
import { isVisible } from "../utils/elements";

type FailureReasonCode = AssertionType | AssertionModifiers | "";

export function getFailureReasonForAssertion(
  failureReasonCode: FailureReasonCode,
  expected: Assertion
): string {
  switch (failureReasonCode) {
    case "visible":
      return `Expected ${expected.typeValue} to be visible (found but hidden).`;
    case "hidden":
      return `Expected ${expected.typeValue} to be hidden (found but visible).`;
    case "text-matches":
      return `Text does not match "${expected.modifiers["text-matches"]}"`;
    case "attrs-match":
      return `Attributes do not match all: "${expected.modifiers["attrs-match"]}"`;
    case "classlist":
      return `Expected classlist does not match: "${expected.modifiers["classlist"]}"`;
    case "value-matches":
      return `Value does not match "${expected.modifiers["value-matches"]}"`;
    case "checked":
      return `Expected checked=${expected.modifiers["checked"]}`;
    case "disabled":
      return `Expected disabled=${expected.modifiers["disabled"]}`;
    case "count":
      return `Element count does not match expected ${expected.modifiers["count"]} for "${expected.typeValue}"`;
    case "count-min":
      return `Element count below minimum ${expected.modifiers["count-min"]} for "${expected.typeValue}"`;
    case "count-max":
      return `Element count exceeds maximum ${expected.modifiers["count-max"]} for "${expected.typeValue}"`;
    case "focused":
      return `Expected focused=${expected.modifiers["focused"]}`;
    case "focused-within":
      return `Expected focused-within=${expected.modifiers["focused-within"]}`;
    default:
      return `Unknown Failure: ${failureReasonCode}`;
  }
}

const assertionTypeMatchers: Record<
  string,
  (assertion: Assertion) => (el: HTMLElement) => boolean
> = {
  _default: (assertion: Assertion) => (el: HTMLElement) =>
    el.matches(assertion.typeValue),
  updated: (assertion: Assertion) => {
    if (!assertion.typeValue) return (el: HTMLElement) => !!el;
    const targetElement = document.querySelector(assertion.typeValue);
    return (el: HTMLElement) =>
      el.matches(assertion.typeValue) ||
      targetElement?.contains(el as Node) ||
      false;
  },
  // stable uses the same subtree matcher as updated
  stable: (assertion: Assertion) => {
    if (!assertion.typeValue) return (el: HTMLElement) => !!el;
    const targetElement = document.querySelector(assertion.typeValue);
    return (el: HTMLElement) =>
      el.matches(assertion.typeValue) ||
      targetElement?.contains(el as Node) ||
      false;
  },
};

/**
 * Assertion Type Modifier specific functions to determine if the assertion passes
 */
const modifiersMap: Record<
  string,
  (el: HTMLElement, modValue: any) => [boolean, FailureReasonCode]
> = {
  "text-matches": (el: HTMLElement, modValue: string) => [
    el.textContent ? new RegExp(modValue).test(el.textContent) : false,
    "text-matches",
  ],
  "attrs-match": (el: HTMLElement, modValue: string) => {
    // Note: This debug log would need access to config/logger to be conditional
    // For now, removing it as it's likely debug output
    let attrs;
    try {
      attrs = JSON.parse(modValue);
    } catch (e) {
      return [false, "attrs-match"];
    }
    return [
      Object.entries(attrs).every(([key, value]) => {
        try {
          return new RegExp("^(?:" + (value as string) + ")$").test(el.getAttribute(key) || "");
        } catch {
          return el.getAttribute(key) === value;
        }
      }),
      "attrs-match",
    ];
  },
  classlist: (el: HTMLElement, modValue: string) => {
    let classMap: Record<string, boolean>;
    try {
      classMap = JSON.parse(modValue);
    } catch (e) {
      return [false, "classlist"];
    }
    return [
      Object.entries(classMap).every(([className, shouldExist]) =>
        shouldExist
          ? el.classList.contains(className)
          : !el.classList.contains(className)
      ),
      "classlist",
    ];
  },
  "value-matches": (el: HTMLElement, modValue: string) => [
    "value" in el ? new RegExp(modValue).test((el as HTMLInputElement).value) : false,
    "value-matches",
  ],
  checked: (el: HTMLElement, modValue: string) => [
    "checked" in el ? (el as HTMLInputElement).checked === (modValue === "true") : false,
    "checked",
  ],
  disabled: (el: HTMLElement, modValue: string) => {
    const isDisabled = ("disabled" in el && (el as HTMLButtonElement).disabled) ||
      el.getAttribute("aria-disabled") === "true";
    return [modValue === "true" ? isDisabled : !isDisabled, "disabled"];
  },
  focused: (el: HTMLElement, modValue: string) => [
    (document.activeElement === el) === (modValue === "true"),
    "focused",
  ],
  "focused-within": (el: HTMLElement, modValue: string) => [
    el.matches(":focus-within") === (modValue === "true"),
    "focused-within",
  ],
};

/**
 * "Modifier-like" functions for base assertion types to determine if the assertion passes
 * These could have been implemented as modifiers, but for now are separate assertion types
 */
const baseAssertionFns: Record<
  string,
  (el: HTMLElement) => [boolean, FailureReasonCode]
> = {
  visible: (el: HTMLElement) => [isVisible(el), "visible"],
  hidden: (el: HTMLElement) => [!isVisible(el), "hidden"],
};

// Selector-level modifiers are checked before per-element iteration
const selectorLevelModifiers = new Set(["count", "count-min", "count-max"]);

/**
 * Return all the modifier functions for an assertion
 */
export function getAssertionModifierFns(
  assertion: Assertion
): Array<(el: HTMLElement) => [boolean, FailureReasonCode]> {
  const mods: Array<(el: HTMLElement) => [boolean, FailureReasonCode]> = [];

  if (baseAssertionFns[assertion.type]) {
    mods.push(baseAssertionFns[assertion.type]);
  }

  // Add additional modifiers (skip selector-level modifiers handled in checkCountModifiers)
  for (const [modName, modValue] of Object.entries(assertion.modifiers)) {
    if (modifiersMap[modName] && !selectorLevelModifiers.has(modName)) {
      mods.push((el: HTMLElement) => modifiersMap[modName](el, modValue));
    }
  }

  return mods;
}

/**
 * Pre-check count modifiers against querySelectorAll result count.
 * Returns [false, reason] on failure, null if count passes or no count modifiers.
 */
function checkCountModifiers(assertion: Assertion): [false, FailureReasonCode] | null {
  const mods = assertion.modifiers;
  if (!mods) return null;
  const count = mods["count"];
  const countMin = mods["count-min"];
  const countMax = mods["count-max"];
  if (!count && !countMin && !countMax) return null;
  if (!assertion.typeValue) return null; // self-referencing, warned at parse time

  const actual = document.querySelectorAll(assertion.typeValue).length;
  if (count && actual !== Number(count)) return [false, "count"];
  if (countMin && actual < Number(countMin)) return [false, "count-min"];
  if (countMax && actual > Number(countMax)) return [false, "count-max"];
  return null;
}

/**
 * Finds matching elements for the assertion and runs modifier checks.
 * Iterates ALL matching elements — passes if ANY satisfies all modifiers.
 * This handles framework list re-renders where multiple elements match
 * the selector but only one satisfies the modifier (e.g., classlist check
 * after toggling a single item in a list).
 */
function handleAssertion(
  elements: HTMLElement[],
  assertion: Assertion,
  matchFn: (el: HTMLElement) => boolean
): CompletedAssertion | null {
  const matchingElements = elements.filter(matchFn);
  if (matchingElements.length === 0) return null;

  // Pre-check selector-level count modifiers before per-element iteration
  const countResult = checkCountModifiers(assertion);
  if (countResult !== null) {
    const [, reasonCode] = countResult;
    return completeAssertion(assertion, false, getFailureReasonForAssertion(reasonCode, assertion));
  }

  const modifierFns = getAssertionModifierFns(assertion);

  // No modifiers — first match is sufficient
  if (modifierFns.length === 0) {
    return completeAssertion(assertion, true, "");
  }

  // Check each matching element — pass if any satisfies all modifiers
  for (const el of matchingElements) {
    let allPassed = true;
    for (const fn of modifierFns) {
      const [result] = fn(el);
      if (!result) { allPassed = false; break; }
    }
    if (allPassed) {
      return completeAssertion(assertion, true, "");
    }
  }

  // No element satisfied all modifiers — fail using first match for the reason
  let failureReason: FailureReasonCode = "";
  for (const fn of modifierFns) {
    const [result, reason] = fn(matchingElements[0]);
    if (!result) { failureReason = reason; break; }
  }

  return completeAssertion(
    assertion,
    false,
    failureReason ? getFailureReasonForAssertion(failureReason, assertion) : ""
  );
}

export const elementResolver: ElementResolver = (
  addedElements: HTMLElement[],
  removedElements: HTMLElement[],
  updatedElements: HTMLElement[],
  assertions: Assertion[]
): CompletedAssertion[] => {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    if (!domAssertions.includes(assertion.type)) {
      return acc;
    }

    let elements: HTMLElement[] = [];
    // Use appropriate element list based on assertion type
    switch (assertion.type) {
      case "added":
        elements = addedElements;
        break;
      case "removed":
        elements = removedElements;
        break;
      case "updated":
        elements = updatedElements;
        break;
      case "stable":
        elements = updatedElements;
        break;
      case "visible":
      case "hidden":
        elements = [...addedElements, ...updatedElements];
        break;
    }

    let matcher = (
      assertionTypeMatchers[assertion.type] || assertionTypeMatchers._default
    )(assertion);

    const completed = handleAssertion(elements, assertion, matcher);

    if (completed) {
      acc.push(completed);
    }

    return acc;
  }, []);
};



export const immediateResolver: AssertionCollectionResolver = (
  assertions: Assertion[],
  _config
): CompletedAssertion[] => {
  // Define match functions based on the assertion type
  const assertionMatchers: Record<string, (el: HTMLElement) => boolean> = {
    _default: (el) => !!el,
    removed: (el) => !el,
  };

  // Reduce over the assertions and apply the handlers
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    if (!domAssertions.includes(assertion.type)) return acc;

    let matcher =
      assertionMatchers[assertion.type] || assertionMatchers._default;

    const matchingElement = document.querySelector(
      assertion.typeValue
    ) as HTMLElement;

    if (matcher(matchingElement)) {
      let hasPassed = true;
      let failureReason: FailureReasonCode = "";
      for (const fn of getAssertionModifierFns(assertion)) {
        const [result, reason] = fn(matchingElement);
        if (!result) {
          hasPassed = false;
          failureReason = reason;
          break;
        }
      }

      if (hasPassed) { // ignore failures in this resolver
        const completed = completeAssertion(
          assertion,
          hasPassed,
          failureReason
            ? getFailureReasonForAssertion(failureReason, assertion)
            : ""
        );

        if (completed) {
          acc.push(completed);
        }
      }
    }

    return acc;
  }, []);
};

export const documentResolver: AssertionCollectionResolver = (
  assertions: Assertion[],
  _config
): CompletedAssertion[] => {
  // Define match functions based on the assertion type
  const assertionMatchers: Record<string, (el: HTMLElement) => boolean> = {
    _default: (el) => !!el,
    removed: (el) => !el,
  };

  // Reduce over the assertions and apply the handlers
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    if (!domAssertions.includes(assertion.type)) return acc;

    let matcher =
      assertionMatchers[assertion.type] || assertionMatchers._default;

    const matchingElement = document.querySelector(
      assertion.typeValue
    ) as HTMLElement;

    if (matcher(matchingElement)) {
      let hasPassed = true;
      let failureReason: FailureReasonCode = "";
      for (const fn of getAssertionModifierFns(assertion)) {
        const [result, reason] = fn(matchingElement);
        if (!result) {
          hasPassed = false;
          failureReason = reason;
          break;
        }
      }

      const completed = completeAssertion(
        assertion,
        hasPassed,
        failureReason
          ? getFailureReasonForAssertion(failureReason, assertion)
          : ""
      );

      if (completed) {
        acc.push(completed);
      }
    }

    return acc;
  }, []);
};
