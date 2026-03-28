import { describe, it, expect } from "vitest";
import { parseTrigger } from "../../src/utils/triggers";

describe("parseTrigger", () => {
  it("returns base only for simple triggers", () => {
    expect(parseTrigger("click")).toEqual({ base: "click" });
  });

  it("parses trigger with key filter", () => {
    expect(parseTrigger("keydown:Escape")).toEqual({ base: "keydown", filter: "Escape" });
  });

  it("parses trigger with modifier key filter", () => {
    expect(parseTrigger("keydown:ctrl+s")).toEqual({ base: "keydown", filter: "ctrl+s" });
  });

  it("parses trigger with multiple modifier keys", () => {
    expect(parseTrigger("keydown:ctrl+shift+s")).toEqual({ base: "keydown", filter: "ctrl+shift+s" });
  });
});
