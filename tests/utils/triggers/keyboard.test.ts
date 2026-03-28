import { describe, it, expect } from "vitest";
import { parseKeyFilter, matchesKeyFilter } from "../../../src/utils/triggers/keyboard";

describe("parseKeyFilter", () => {
  it("parses simple key", () => {
    expect(parseKeyFilter("Escape")).toEqual({
      key: "Escape", ctrl: false, shift: false, alt: false, meta: false,
    });
  });

  it("parses key with ctrl modifier", () => {
    expect(parseKeyFilter("ctrl+s")).toEqual({
      key: "s", ctrl: true, shift: false, alt: false, meta: false,
    });
  });

  it("parses key with multiple modifiers", () => {
    expect(parseKeyFilter("ctrl+shift+s")).toEqual({
      key: "s", ctrl: true, shift: true, alt: false, meta: false,
    });
  });

  it("parses key with all modifiers", () => {
    expect(parseKeyFilter("ctrl+shift+alt+meta+k")).toEqual({
      key: "k", ctrl: true, shift: true, alt: true, meta: true,
    });
  });
});

describe("matchesKeyFilter", () => {
  function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
      key: "a",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...overrides,
    } as KeyboardEvent;
  }

  it("matches when key and modifiers match", () => {
    const filter = parseKeyFilter("Escape");
    const event = makeKeyEvent({ key: "Escape" });
    expect(matchesKeyFilter(event, filter)).toBe(true);
  });

  it("rejects when key does not match", () => {
    const filter = parseKeyFilter("Escape");
    const event = makeKeyEvent({ key: "Enter" });
    expect(matchesKeyFilter(event, filter)).toBe(false);
  });

  it("rejects when required modifier is missing", () => {
    const filter = parseKeyFilter("ctrl+s");
    const event = makeKeyEvent({ key: "s", ctrlKey: false });
    expect(matchesKeyFilter(event, filter)).toBe(false);
  });

  it("rejects when extra modifier is present", () => {
    const filter = parseKeyFilter("s");
    const event = makeKeyEvent({ key: "s", ctrlKey: true });
    expect(matchesKeyFilter(event, filter)).toBe(false);
  });

  it("matches with ctrl+s", () => {
    const filter = parseKeyFilter("ctrl+s");
    const event = makeKeyEvent({ key: "s", ctrlKey: true });
    expect(matchesKeyFilter(event, filter)).toBe(true);
  });

  it("key matching is case-insensitive", () => {
    const filter = parseKeyFilter("escape");
    const event = makeKeyEvent({ key: "Escape" });
    expect(matchesKeyFilter(event, filter)).toBe(true);
  });
});
