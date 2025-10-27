import { assertionPrefix } from '../config';
import type { Assertion, ElementProcessor } from '../types';

export function eventProcessor(event: Event, processor: ElementProcessor): Assertion[] {
  const target = event.target as HTMLElement;
  return processor([target])
}