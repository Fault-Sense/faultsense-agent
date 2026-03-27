import { domAssertions, oobPrefix, assertionPrefix } from "../config";
import { Assertion, AssertionType, CompletedAssertion } from "../types";
import { parseTypeValue, resolveInlineModifiers } from "./elements";

/**
 * Build a compound CSS selector to find all OOB elements in the DOM.
 * e.g., "[fs-assert-oob-added],[fs-assert-oob-removed],[fs-assert-oob-updated],..."
 */
const oobSelector = domAssertions
  .map((type) => `[${oobPrefix}${type}]`)
  .join(",");

/**
 * Scan the DOM for OOB elements triggered by the given passed assertions.
 * For each match, create an assertion that enters the normal resolution pipeline.
 */
export function findAndCreateOobAssertions(
  passedAssertions: CompletedAssertion[]
): Assertion[] {
  const passedKeys = new Set(passedAssertions.map((a) => a.assertionKey));
  const oobElements = document.querySelectorAll(oobSelector);
  const assertions: Assertion[] = [];

  // Warn about unsupported route OOB assertions
  const routeOobElements = document.querySelectorAll(`[${oobPrefix}route]`);
  if (routeOobElements.length > 0) {
    console.warn("[Faultsense]: fs-assert-oob-route is not supported. Route assertions cannot be triggered via OOB.");
  }

  for (const el of Array.from(oobElements) as HTMLElement[]) {
    // Check each OOB type attribute on this element
    for (const type of domAssertions) {
      const attrName = `${oobPrefix}${type}`;
      const attrValue = el.getAttribute(attrName);
      if (!attrValue) continue;

      // Check if any of the comma-separated keys match a passed assertion
      const parentKeys = attrValue.split(",").map((k) => k.trim());
      const triggered = parentKeys.some((k) => passedKeys.has(k));
      if (!triggered) continue;

      // Get the assertion key for this OOB element
      const assertionKey = el.getAttribute(`${assertionPrefix.details}assert`);
      if (!assertionKey) continue;

      // Get the assertion type value (selector + modifiers)
      const typeAttrName = `${assertionPrefix.types}${type}`;
      const typeAttrValue = el.getAttribute(typeAttrName);
      if (!typeAttrValue) continue;

      const { selector, modifiers } = parseTypeValue(typeAttrValue);
      const resolvedMods = resolveInlineModifiers(modifiers);

      // Self-targeting: if selector is empty, the element itself is the target.
      // Generate a unique selector for self using the element's id or a data attribute.
      let targetSelector = selector;
      if (!targetSelector) {
        if (el.id) {
          targetSelector = `#${el.id}`;
        } else {
          // Fallback: tag the element with a temporary data attribute for targeting
          const tempId = `fs-oob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          el.setAttribute("data-fs-oob-target", tempId);
          targetSelector = `[data-fs-oob-target="${tempId}"]`;
        }
      }

      assertions.push({
        assertionKey: assertionKey,
        elementSnapshot: el.outerHTML,
        mpa_mode: false,
        trigger: "oob",
        timeout: Number(el.getAttribute(`${assertionPrefix.modifiers}timeout`)) || 0,
        startTime: Date.now(),
        type: type as AssertionType,
        typeValue: targetSelector,
        modifiers: resolvedMods,
        oob: true,
      });
    }
  }

  return assertions;
}
