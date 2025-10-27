export function isSubset(
  subset: Record<string, any>,
  target: Record<string, any>
): boolean {
  return Object.keys(subset).every(
    (key) => target.hasOwnProperty(key) && subset[key] === target[key]
  );
}

export function prettyPrintHeaders(obj: Record<string, any>): string {
  return Object.entries(obj)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}
