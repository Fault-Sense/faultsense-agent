import { describe, it, expect } from "vitest";
import {
  parseCustomEventTrigger,
  matchesDetail,
  isCustomEventTrigger,
} from "../../../src/utils/triggers/custom-events";

describe("isCustomEventTrigger", () => {
  it("returns true for event: prefix", () => {
    expect(isCustomEventTrigger("event:cart-updated")).toBe(true);
  });

  it("returns false for native triggers", () => {
    expect(isCustomEventTrigger("click")).toBe(false);
    expect(isCustomEventTrigger("mount")).toBe(false);
    expect(isCustomEventTrigger("keydown:Escape")).toBe(false);
  });
});

describe("parseCustomEventTrigger", () => {
  it("parses simple event name", () => {
    const result = parseCustomEventTrigger("event:cart-updated");
    expect(result).toEqual({ eventName: "cart-updated" });
  });

  it("parses event name with detail-matches", () => {
    const result = parseCustomEventTrigger("event:cart-updated[detail-matches=action:increment]");
    expect(result).toEqual({
      eventName: "cart-updated",
      detailMatches: { action: "increment" },
    });
  });

  it("parses multiple detail-matches pairs", () => {
    const result = parseCustomEventTrigger("event:order[detail-matches=status:complete,type:subscription]");
    expect(result).toEqual({
      eventName: "order",
      detailMatches: { status: "complete", type: "subscription" },
    });
  });

  it("handles event name with colons", () => {
    const result = parseCustomEventTrigger("event:payment:complete");
    expect(result).toEqual({ eventName: "payment:complete" });
  });
});

describe("matchesDetail", () => {
  it("matches object detail with shallow equality", () => {
    const event = new CustomEvent("test", { detail: { action: "increment", count: 5 } });
    expect(matchesDetail(event, { action: "increment" })).toBe(true);
  });

  it("rejects when key value doesn't match", () => {
    const event = new CustomEvent("test", { detail: { action: "decrement" } });
    expect(matchesDetail(event, { action: "increment" })).toBe(false);
  });

  it("rejects when key is missing from detail", () => {
    const event = new CustomEvent("test", { detail: { other: "value" } });
    expect(matchesDetail(event, { action: "increment" })).toBe(false);
  });

  it("matches primitive detail against stringified value", () => {
    const event = new CustomEvent("test", { detail: 42 });
    expect(matchesDetail(event, { _: "42" })).toBe(true);
  });

  it("rejects null detail", () => {
    const event = new CustomEvent("test", { detail: null });
    expect(matchesDetail(event, { action: "increment" })).toBe(false);
  });

  it("rejects undefined detail", () => {
    const event = new CustomEvent("test");
    expect(matchesDetail(event, { action: "increment" })).toBe(false);
  });

  it("converts non-string detail values to strings for comparison", () => {
    const event = new CustomEvent("test", { detail: { count: 5 } });
    expect(matchesDetail(event, { count: "5" })).toBe(true);
  });

  it("requires all matchers to match (AND semantics)", () => {
    const event = new CustomEvent("test", { detail: { a: "1", b: "2" } });
    expect(matchesDetail(event, { a: "1", b: "2" })).toBe(true);
    expect(matchesDetail(event, { a: "1", b: "wrong" })).toBe(false);
  });
});
