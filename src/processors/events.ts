import { assertionTriggerAttr } from '../config';
import type { Assertion, ElementProcessor } from '../types';

/**
 * Resolve a DOM event to the element that owns the assertion.
 *
 * Clicks on descendants of an `fs-trigger` host (icon spans inside a button,
 * text inside a label, etc.) should still fire the host's assertion — same
 * delegation model as HTMX, Stimulus, and native form handling. Walk up from
 * `event.target` via `closest()` so the processor receives the host element.
 * Falls back to the raw target when no ancestor is instrumented, preserving
 * the legacy path for tests that dispatch events on the host directly.
 */
export function eventProcessor(event: Event, processor: ElementProcessor): Assertion[] {
  const rawTarget = event.target as HTMLElement | null;
  if (!rawTarget) return [];
  const host = rawTarget.closest?.(`[${assertionTriggerAttr}]`) as HTMLElement | null;
  return processor([host ?? rawTarget]);
}
