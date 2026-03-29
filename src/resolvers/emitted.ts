import type { Assertion, CompletedAssertion } from "../types";
import { completeAssertion } from "../assertions/assertion";

/**
 * Resolves "emitted" assertions by checking if the fired CustomEvent
 * matches the expected event name and optional detail-matches modifier.
 *
 * detail-matches supports regex matching on values (consistent with text-matches).
 */
export function emittedResolver(
  event: CustomEvent,
  pendingEmitted: Assertion[]
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  for (const assertion of pendingEmitted) {
    if (assertion.type !== "emitted") continue;
    if (assertion.endTime) continue;

    // typeValue is the event name (parsed from "fs-assert-emitted" value minus modifiers)
    if (assertion.typeValue !== event.type) continue;

    // Check detail-matches modifier if present
    if (assertion.modifiers?.["detail-matches"]) {
      const detail = event.detail;
      if (detail === null || detail === undefined) continue;

      const raw = assertion.modifiers["detail-matches"] as string;
      const matchers = parseDetailMatchesRegex(raw);

      if (typeof detail !== "object") {
        // Primitive: match against stringified value with first matcher's value as regex
        const entries = Object.entries(matchers);
        if (entries.length !== 1 || !new RegExp(entries[0][1]).test(String(detail))) {
          continue;
        }
      } else {
        // Object: regex match per key
        let allMatch = true;
        for (const [key, pattern] of Object.entries(matchers)) {
          if (!(key in detail) || !new RegExp(pattern).test(String(detail[key]))) {
            allMatch = false;
            break;
          }
        }
        if (!allMatch) continue;
      }
    }

    const result = completeAssertion(assertion, true);
    if (result) completed.push(result);
  }

  return completed;
}

/**
 * Parse "key:pattern,key2:pattern2" into a Record.
 * Values are regex patterns (consistent with text-matches behavior).
 */
function parseDetailMatchesRegex(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}
