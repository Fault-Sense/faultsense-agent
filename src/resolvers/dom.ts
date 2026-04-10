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
 * Check if an element satisfies all of the assertion's modifier functions.
 */
function passesAllModifiers(
  el: HTMLElement,
  modifierFns: Array<(el: HTMLElement) => boolean>
): boolean {
  for (const fn of modifierFns) {
    if (!fn(el)) return false;
  }
  return true;
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
 *
 * Wait-for-pass semantics: if no matching element satisfies the assertion,
 * return null so the assertion stays pending and re-evaluates on the next
 * mutation. Failure is delivered by explicit `fs-assert-timeout`, the GC
 * sweep, or page unload — never by a mid-flight negative check. This makes
 * the resolver robust to transient DOM states (HTMX swap classes, enter/
 * leave transitions, concurrent rendering, CSS animation classes, etc.).
 *
 * Exceptions — these commit on negative results:
 *   - invertResolution types (`stable`): "should not have been mutated"
 *     is defined by first observation, so any mutation is a failure.
 *   - invariants: "should always hold" commits immediately on violation,
 *     and also commits on pass to handle recovery (failed → passed).
 */
function handleAssertion(
  elements: HTMLElement[],
  assertion: Assertion,
  matchFn: (el: HTMLElement) => boolean
): CompletedAssertion | null {
  const matchingElements = elements.filter(matchFn);

  // Inverted-resolution types (stable): any matching mutation is a fail.
  // This path bypasses modifier checks — the mere fact that a mutation
  // landed on the target subtree is the failure signal.
  if (assertion.invertResolution) {
    if (matchingElements.length === 0) return null;
    return completeAssertion(assertion, true); // completeAssertion inverts
  }

  if (matchingElements.length === 0) return null;

  // Pre-check selector-level count modifiers before per-element iteration.
  // Count mismatch stays pending (wait-for-pass) — the DOM may still settle.
  // Invariants commit immediately on count violation.
  if (checkCountModifiers(assertion) === false) {
    return assertion.trigger === "invariant"
      ? completeAssertion(assertion, false)
      : null;
  }

  const modifierFns = getAssertionModifierFns(assertion);

  // No modifiers — first match is sufficient
  if (modifierFns.length === 0) {
    return completeAssertion(assertion, true);
  }

  // Pass if any matching element satisfies all modifiers.
  for (const el of matchingElements) {
    if (passesAllModifiers(el, modifierFns)) {
      return completeAssertion(assertion, true);
    }
  }

  // Invariants commit on violation so the failure propagates; everything
  // else stays pending until pass, timeout, or GC sweep.
  return assertion.trigger === "invariant"
    ? completeAssertion(assertion, false)
    : null;
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

    const matcher = (
      assertionTypeMatchers[assertion.type] || assertionTypeMatchers._default
    )(assertion);

    const completed = handleAssertion(elements, assertion, matcher);

    if (completed) {
      acc.push(completed);
    }

    return acc;
  }, []);
};

/**
 * Document-state resolver used for immediate checks (just after a trigger
 * fires) and periodic sweeps of pending assertions. Unlike `elementResolver`,
 * which observes mutation deltas, this queries the document directly.
 *
 * Wait-for-pass: only a positive result settles the assertion. Negative
 * results leave it pending. `removed` passes when the target no longer
 * exists, so it has no element to run modifiers against — modifiers are
 * skipped for the null-element case.
 */
function resolveFromDocument(
  assertions: Assertion[]
): CompletedAssertion[] {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    if (!domAssertions.includes(assertion.type)) return acc;

    const matchingElement = document.querySelector(
      assertion.typeValue
    ) as HTMLElement | null;

    // `removed` passes when the element is gone; no modifier checks apply.
    if (assertion.type === "removed") {
      if (matchingElement) return acc;
      const completed = completeAssertion(assertion, true);
      if (completed) acc.push(completed);
      return acc;
    }

    if (!matchingElement) return acc;

    // Selector-level count modifiers (run once, on the document).
    if (checkCountModifiers(assertion) === false) return acc;

    if (passesAllModifiers(matchingElement, getAssertionModifierFns(assertion))) {
      const completed = completeAssertion(assertion, true);
      if (completed) acc.push(completed);
    }
    return acc;
  }, []);
}

export const immediateResolver: AssertionCollectionResolver = (
  assertions: Assertion[],
  _config
): CompletedAssertion[] => resolveFromDocument(assertions);

export const documentResolver: AssertionCollectionResolver = (
  assertions: Assertion[],
  _config
): CompletedAssertion[] => resolveFromDocument(assertions);
