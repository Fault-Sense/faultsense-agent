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
