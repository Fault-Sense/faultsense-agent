import { parseTypeValue } from "../../processors/elements";

export const CUSTOM_EVENT_PREFIX = "event:";

export interface ParsedCustomEventTrigger {
  eventName: string;
  detailMatches?: Record<string, string>;
}

/**
 * Parse a custom event trigger value like "event:cart-updated[detail-matches=action:increment]".
 * Strips the "event:" prefix, delegates bracket parsing to parseTypeValue,
 * and converts detail-matches to key:value pairs.
 */
export function parseCustomEventTrigger(raw: string): ParsedCustomEventTrigger {
  const withoutPrefix = raw.slice(CUSTOM_EVENT_PREFIX.length);
  const { selector, modifiers } = parseTypeValue(withoutPrefix);

  const result: ParsedCustomEventTrigger = { eventName: selector };

  if (modifiers["detail-matches"]) {
    result.detailMatches = parseDetailMatches(modifiers["detail-matches"]);
  }

  return result;
}

/**
 * Parse "key:value,key2:value2" into a Record.
 */
function parseDetailMatches(raw: string): Record<string, string> {
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

/**
 * Check if a CustomEvent's detail matches the expected key:value pairs.
 * Primitive detail: matches against String(event.detail).
 * Object detail: shallow string equality on each key.
 */
export function matchesDetail(event: CustomEvent, matchers: Record<string, string>): boolean {
  const detail = event.detail;
  if (detail === null || detail === undefined) return false;

  // Primitive detail — match against stringified value
  if (typeof detail !== "object") {
    const entries = Object.entries(matchers);
    // For primitives, expect a single matcher with no key or match the value directly
    return entries.length === 1 && String(detail) === entries[0][1];
  }

  // Object detail — shallow string equality per key
  for (const [key, expected] of Object.entries(matchers)) {
    if (String(detail[key]) !== expected) return false;
  }
  return true;
}

/**
 * Check if a trigger value is a custom event trigger (starts with "event:").
 */
export function isCustomEventTrigger(triggerValue: string): boolean {
  return triggerValue.startsWith(CUSTOM_EVENT_PREFIX);
}
