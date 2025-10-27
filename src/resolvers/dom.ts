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

function getFailureReasonForAssertion(
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
        return el.getAttribute(key) === value;
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

/**
 * Return all the modifier functions for an assertion
 */
function getAssertionModifierFns(
  assertion: Assertion
): Array<(el: HTMLElement) => [boolean, FailureReasonCode]> {
  const mods: Array<(el: HTMLElement) => [boolean, FailureReasonCode]> = [];

  if (baseAssertionFns[assertion.type]) {
    mods.push(baseAssertionFns[assertion.type]);
  }

  // Add additional modifiers
  for (const [modName, modValue] of Object.entries(assertion.modifiers)) {
    if (modifiersMap[modName]) {
      mods.push((el: HTMLElement) => modifiersMap[modName](el, modValue));
    }
  }

  return mods;
}

/**
 * Finds a matching element for the assertion and runs the assertion checks
 * completing the assertion if an element matches
 */
function handleAssertion(
  elements: HTMLElement[],
  assertion: Assertion,
  matchFn: (el: HTMLElement) => boolean
): CompletedAssertion | null {
  const matchingElement = elements.find(matchFn);
  if (!matchingElement) return null;

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

  return completeAssertion(
    assertion,
    hasPassed,
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
