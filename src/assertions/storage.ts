// We cannot check for the global MPA_MODE here
// because individual assertions may have their own MPA_MODE

import { Assertion } from "../types";
import { storageKey } from "../config";

export function loadAssertions(): Assertion[] {
  const data = localStorage.getItem(storageKey);
  if (data) {
    localStorage.removeItem(storageKey);
    return JSON.parse(data);
  }
  return [];
}

export function storeAssertions(activeAssertions: Assertion[]) {
  if (activeAssertions.length) {
    localStorage.setItem(storageKey, JSON.stringify(activeAssertions));
  }
}
