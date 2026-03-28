export interface ParsedTrigger {
  base: string;
  filter?: string;
}

export function parseTrigger(raw: string): ParsedTrigger {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return { base: raw };
  return {
    base: raw.substring(0, colonIdx),
    filter: raw.substring(colonIdx + 1),
  };
}

export interface KeyFilter {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function parseKeyFilter(filter: string): KeyFilter {
  const parts = filter.split("+");
  const key = parts.pop()!;
  return {
    key,
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta"),
  };
}

export function matchesKeyFilter(event: KeyboardEvent, filter: KeyFilter): boolean {
  const keyMatch = event.key.toLowerCase() === filter.key.toLowerCase();
  return (
    keyMatch &&
    event.ctrlKey === filter.ctrl &&
    event.shiftKey === filter.shift &&
    event.altKey === filter.alt &&
    event.metaKey === filter.meta
  );
}
