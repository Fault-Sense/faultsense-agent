import { domAssertions, oobAttr, oobFailAttr, assertionPrefix } from "../config";
import { Assertion, AssertionType, CompletedAssertion } from "../types";
import { parseTypeValue, resolveInlineModifiers } from "./elements";

/**
 * Scan the DOM for OOB elements whose parent keys match the given assertions.
 * Creates assertions that enter the normal resolution pipeline.
 */
function findOobByAttr(
  attr: string,
  triggerName: string,
  parentAssertions: CompletedAssertion[]
): Assertion[] {
  if (parentAssertions.length === 0) return [];

  const parentKeys = new Set(parentAssertions.map((a) => a.assertionKey));
  const oobElements = document.querySelectorAll(`[${attr}]`);
  const assertions: Assertion[] = [];

  // Warn about unsupported route OOB assertions
  const routeOobElements = document.querySelectorAll(`[${oobPrefix}route]`);
  if (routeOobElements.length > 0) {
    console.warn("[Faultsense]: fs-assert-oob-route is not supported. Route assertions cannot be triggered via OOB.");
  }

  for (const el of Array.from(oobElements) as HTMLElement[]) {
    const assertionKey = el.getAttribute(`${assertionPrefix.details}assert`);
    if (!assertionKey) continue;

    const attrValue = el.getAttribute(attr);
    if (!attrValue) continue;

    const keys = attrValue.split(",").map((k) => k.trim());
    if (!keys.some((k) => parentKeys.has(k))) continue;

    // Collect assertion types from standard fs-assert-{type} attributes
    for (const type of domAssertions) {
      const typeAttrName = `${assertionPrefix.types}${type}`;
      const typeAttrValue = el.getAttribute(typeAttrName);
      if (!typeAttrValue) continue;

      const { selector, modifiers } = parseTypeValue(typeAttrValue);
      const resolvedMods = resolveInlineModifiers(modifiers);

      // Self-targeting: if selector is empty, the element itself is the target.
      let targetSelector = selector;
      if (!targetSelector) {
        if (el.id) {
          targetSelector = `#${el.id}`;
        } else {
          const tempId = `fs-oob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          el.setAttribute("data-fs-oob-target", tempId);
          targetSelector = `[data-fs-oob-target="${tempId}"]`;
        }
      }

      assertions.push({
        assertionKey,
        elementSnapshot: el.outerHTML,
        mpa_mode: false,
        trigger: triggerName,
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

/**
 * Find OOB assertions triggered by passed and/or failed parent assertions.
 *
 * - fs-assert-oob="key1,key2" triggers when any listed parent passes
 * - fs-assert-oob-fail="key1,key2" triggers when any listed parent fails
 */
export function findAndCreateOobAssertions(
  passedAssertions: CompletedAssertion[],
  failedAssertions: CompletedAssertion[] = []
): Assertion[] {
  return [
    ...findOobByAttr(oobAttr, "oob", passedAssertions),
    ...findOobByAttr(oobFailAttr, "oob-fail", failedAssertions),
  ];
}
