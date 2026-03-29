import { completeAssertion } from "../assertions/assertion";
import { domAssertions } from "../config";
import {
  Assertion,
  CompletedAssertion,
  ElementResolver,
  AssertionCollectionResolver,
} from "../types";
import { isVisible } from "../utils/elements";

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
  (el: HTMLElement, modValue: any) => boolean
> = {
  "text-matches": (el: HTMLElement, modValue: string) =>
    el.textContent ? new RegExp(modValue).test(el.textContent) : false,
  "attrs-match": (el: HTMLElement, modValue: string) => {
    let attrs;
    try {
      attrs = JSON.parse(modValue);
    } catch (e) {
      return false;
    }
    return Object.entries(attrs).every(([key, value]) => {
      try {
        return new RegExp("^(?:" + (value as string) + ")$").test(el.getAttribute(key) || "");
      } catch {
        return el.getAttribute(key) === value;
      }
    });
  },
  classlist: (el: HTMLElement, modValue: string) => {
    let classMap: Record<string, boolean>;
    try {
      classMap = JSON.parse(modValue);
    } catch (e) {
      return false;
    }
    return Object.entries(classMap).every(([className, shouldExist]) =>
      shouldExist
        ? el.classList.contains(className)
        : !el.classList.contains(className)
    );
  },
  "value-matches": (el: HTMLElement, modValue: string) =>
    "value" in el ? new RegExp(modValue).test((el as HTMLInputElement).value) : false,
  checked: (el: HTMLElement, modValue: string) =>
    "checked" in el ? (el as HTMLInputElement).checked === (modValue === "true") : false,
  disabled: (el: HTMLElement, modValue: string) => {
    const isDisabled = ("disabled" in el && (el as HTMLButtonElement).disabled) ||
      el.getAttribute("aria-disabled") === "true";
    return modValue === "true" ? isDisabled : !isDisabled;
  },
  focused: (el: HTMLElement, modValue: string) =>
    (document.activeElement === el) === (modValue === "true"),
  "focused-within": (el: HTMLElement, modValue: string) =>
    el.matches(":focus-within") === (modValue === "true"),
};

/**
 * "Modifier-like" functions for base assertion types to determine if the assertion passes
 * These could have been implemented as modifiers, but for now are separate assertion types
 */
const baseAssertionFns: Record<
  string,
  (el: HTMLElement) => boolean
> = {
  visible: (el: HTMLElement) => isVisible(el),
  hidden: (el: HTMLElement) => !isVisible(el),
};

// Selector-level modifiers are checked before per-element iteration
const selectorLevelModifiers = new Set(["count", "count-min", "count-max"]);

/**
 * Return all the modifier functions for an assertion
 */
export function getAssertionModifierFns(
  assertion: Assertion
): Array<(el: HTMLElement) => boolean> {
  const mods: Array<(el: HTMLElement) => boolean> = [];

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
 * Returns false on failure, null if count passes or no count modifiers.
 */
function checkCountModifiers(assertion: Assertion): false | null {
  const mods = assertion.modifiers;
  if (!mods) return null;
  const count = mods["count"];
  const countMin = mods["count-min"];
  const countMax = mods["count-max"];
  if (!count && !countMin && !countMax) return null;
  if (!assertion.typeValue) return null; // self-referencing, warned at parse time

  const actual = document.querySelectorAll(assertion.typeValue).length;
  if (count && actual !== Number(count)) return false;
  if (countMin && actual < Number(countMin)) return false;
  if (countMax && actual > Number(countMax)) return false;
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
    return completeAssertion(assertion, false);
  }

  const modifierFns = getAssertionModifierFns(assertion);

  // No modifiers — first match is sufficient
  if (modifierFns.length === 0) {
    return completeAssertion(assertion, true);
  }

  // Check each matching element — pass if any satisfies all modifiers
  for (const el of matchingElements) {
    let allPassed = true;
    for (const fn of modifierFns) {
      if (!fn(el)) { allPassed = false; break; }
    }
    if (allPassed) {
      return completeAssertion(assertion, true);
    }
  }

  return completeAssertion(assertion, false);
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
      for (const fn of getAssertionModifierFns(assertion)) {
        if (!fn(matchingElement)) {
          hasPassed = false;
          break;
        }
      }

      if (hasPassed) { // ignore failures in this resolver
        const completed = completeAssertion(assertion, hasPassed);

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
      for (const fn of getAssertionModifierFns(assertion)) {
        if (!fn(matchingElement)) {
          hasPassed = false;
          break;
        }
      }

      const completed = completeAssertion(assertion, hasPassed);

      if (completed) {
        acc.push(completed);
      }
    }

    return acc;
  }, []);
};
