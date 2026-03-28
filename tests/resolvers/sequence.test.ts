import { describe, it, expect } from "vitest";
import { sequenceResolver } from "../../src/resolvers/sequence";
import type { Assertion, Configuration } from "../../src/types";

const config = {
  apiKey: "TEST_API_KEY",
  releaseLabel: "0.0.0",
  gcInterval: 30000,
  unloadGracePeriod: 2000,
  collectorURL: "http://localhost:9000",
} as Configuration;

function makeAssertion(overrides: Partial<Assertion> = {}): Assertion {
  return {
    assertionKey: "test/key",
    type: "after",
    typeValue: "step/A",
    trigger: "click",
    startTime: Date.now(),
    endTime: undefined,
    status: undefined,
    statusReason: "",
    timeout: 0,
    mpa_mode: false,
    elementSnapshot: "<button>Test</button>",
    modifiers: {},
    ...overrides,
  } as Assertion;
}

describe("sequenceResolver", () => {
  it("passes when parent assertion has passed", () => {
    const parent = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: "passed" as any,
      endTime: Date.now(),
    });
    const after = makeAssertion({
      assertionKey: "flow/step-B",
      typeValue: "step/A",
    });

    const results = sequenceResolver([parent, after], config);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      assertionKey: "flow/step-B",
      status: "passed",
      statusReason: "",
    });
  });

  it("fails when parent assertion does not exist", () => {
    const after = makeAssertion({
      assertionKey: "flow/step-B",
      typeValue: "step/A",
    });

    const results = sequenceResolver([after], config);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "failed",
      statusReason: 'Precondition not met: "step/A" has not passed.',
    });
  });

  it("fails when parent assertion is pending (no status)", () => {
    const parent = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: undefined as any,
    });
    const after = makeAssertion({
      assertionKey: "flow/step-B",
      typeValue: "step/A",
    });

    const results = sequenceResolver([parent, after], config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
  });

  it("fails when parent assertion has failed", () => {
    const parent = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: "failed" as any,
      endTime: Date.now(),
    });
    const after = makeAssertion({
      assertionKey: "flow/step-B",
      typeValue: "step/A",
    });

    const results = sequenceResolver([parent, after], config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
  });

  it("fails when parent assertion is dismissed", () => {
    const parent = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: "dismissed" as any,
      endTime: Date.now(),
    });
    const after = makeAssertion({
      assertionKey: "flow/step-B",
      typeValue: "step/A",
    });

    const results = sequenceResolver([parent, after], config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
  });

  it("requires ALL parents to have passed (AND semantics)", () => {
    const parentA = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: "passed" as any,
      endTime: Date.now(),
    });
    const parentB = makeAssertion({
      assertionKey: "step/B",
      type: "visible",
      // not passed
    });
    const after = makeAssertion({
      assertionKey: "flow/step-C",
      typeValue: "step/A,step/B",
    });

    const results = sequenceResolver([parentA, parentB, after], config);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "failed",
      statusReason: 'Precondition not met: "step/B" has not passed.',
    });
  });

  it("passes when ALL parents have passed", () => {
    const parentA = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: "passed" as any,
      endTime: Date.now(),
    });
    const parentB = makeAssertion({
      assertionKey: "step/B",
      type: "visible",
      status: "passed" as any,
      endTime: Date.now(),
    });
    const after = makeAssertion({
      assertionKey: "flow/step-C",
      typeValue: "step/A,step/B",
    });

    const results = sequenceResolver([parentA, parentB, after], config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("passed");
  });

  it("supports chaining (A -> B -> C)", () => {
    const parentA = makeAssertion({
      assertionKey: "step/A",
      type: "visible",
      status: "passed" as any,
      endTime: Date.now(),
    });
    const afterB = makeAssertion({
      assertionKey: "step/B",
      type: "after",
      typeValue: "step/A",
      status: "passed" as any,
      endTime: Date.now(),
    });
    const afterC = makeAssertion({
      assertionKey: "step/C",
      type: "after",
      typeValue: "step/B",
    });

    const results = sequenceResolver([parentA, afterB, afterC], config);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      assertionKey: "step/C",
      status: "passed",
    });
  });

  it("skips non-after assertions", () => {
    const visible = makeAssertion({
      type: "visible",
      typeValue: "#panel",
    });

    const results = sequenceResolver([visible], config);
    expect(results).toHaveLength(0);
  });

  it("skips completed after assertions", () => {
    const after = makeAssertion({
      assertionKey: "flow/step-B",
      typeValue: "step/A",
      endTime: Date.now(),
      status: "passed" as any,
    });

    const results = sequenceResolver([after], config);
    expect(results).toHaveLength(0);
  });
});
