import { useState, useEffect, useRef, useCallback } from "react";

// ── URL param parsing ────────────���──────────────────────────────────

const params = new URLSearchParams(window.location.search);
const ASSERTION_COUNT = parseInt(params.get("assertions") ?? "50", 10);
const CHURN_RATE = parseInt(params.get("churnRate") ?? "0", 10);
const CHURN_NODES = parseInt(params.get("churnNodes") ?? "100", 10);

// ── Archetype definitions ──────────��────────────────────────────────
// 8 archetypes cycling through different trigger/assertion combinations.
// Distribution: 20% updated, 15% added, 10% removed, 10% input-visible,
// 10% submit-conditional, 10% mount-visible, 10% invariant-stable, 15% OOB

type Archetype =
  | "click-updated"
  | "click-added"
  | "click-removed"
  | "input-visible"
  | "submit-conditional"
  | "mount-visible"
  | "invariant-stable"
  | "click-oob";

const ARCHETYPE_WEIGHTS: [Archetype, number][] = [
  ["click-updated", 20],
  ["click-added", 15],
  ["click-removed", 10],
  ["input-visible", 10],
  ["submit-conditional", 10],
  ["mount-visible", 10],
  ["invariant-stable", 10],
  ["click-oob", 15],
];

function assignArchetypes(count: number): Archetype[] {
  const totalWeight = ARCHETYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  const result: Archetype[] = [];
  for (const [archetype, weight] of ARCHETYPE_WEIGHTS) {
    const n = Math.round((weight / totalWeight) * count);
    for (let i = 0; i < n && result.length < count; i++) {
      result.push(archetype);
    }
  }
  // Fill remainder with the first archetype
  while (result.length < count) {
    result.push("click-updated");
  }
  return result;
}

const ARCHETYPES = assignArchetypes(ASSERTION_COUNT);

// ── Instrumented widgets ─────────────��──────────────────────────────

function ClickUpdatedWidget({ index }: { index: number }) {
  const [count, setCount] = useState(0);
  return (
    <div
      className="stress-widget"
      data-archetype="click-updated"
      fs-assert={`stress/updated-${index}`}
      fs-trigger="click"
      fs-assert-updated={`#widget-updated-${index}-content[text-matches=\\d+]`}
      onClick={() => setCount((c) => c + 1)}
    >
      <span id={`widget-updated-${index}-content`}>{count}</span>
    </div>
  );
}

function ClickAddedWidget({ index }: { index: number }) {
  const [items, setItems] = useState<number[]>([]);
  return (
    <div
      className="stress-widget"
      data-archetype="click-added"
      fs-assert={`stress/added-${index}`}
      fs-trigger="click"
      fs-assert-added={`.added-item-${index}`}
      onClick={() => setItems((prev) => [...prev, prev.length])}
    >
      {items.map((item) => (
        <span key={item} className={`added-item-${index}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function ClickRemovedWidget({ index }: { index: number }) {
  const [items, setItems] = useState([0, 1, 2]);
  return (
    <div
      className="stress-widget"
      data-archetype="click-removed"
      fs-assert={`stress/removed-${index}`}
      fs-trigger="click"
      fs-assert-removed={`.removed-item-${index}`}
      onClick={() =>
        setItems((prev) => (prev.length > 0 ? prev.slice(0, -1) : [0, 1, 2]))
      }
    >
      {items.map((item) => (
        <span key={item} className={`removed-item-${index}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function InputVisibleWidget({ index }: { index: number }) {
  const [value, setValue] = useState("");
  return (
    <div className="stress-widget" data-archetype="input-visible">
      <input
        id={`widget-input-${index}`}
        fs-assert={`stress/input-${index}`}
        fs-trigger="input"
        fs-assert-visible={`#widget-input-${index}[value-matches=.]`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function SubmitConditionalWidget({ index }: { index: number }) {
  const [result, setResult] = useState<"none" | "success" | "error">("none");
  return (
    <div className="stress-widget" data-archetype="submit-conditional">
      <form
        fs-assert={`stress/submit-${index}`}
        fs-trigger="submit"
        fs-assert-mutex="conditions"
        fs-assert-added-success={`.submit-success-${index}`}
        fs-assert-added-error={`.submit-error-${index}`}
        onSubmit={(e) => {
          e.preventDefault();
          setResult(Math.random() > 0.5 ? "success" : "error");
        }}
      >
        <button type="submit">Go</button>
      </form>
      {result === "success" && (
        <span className={`submit-success-${index}`}>OK</span>
      )}
      {result === "error" && (
        <span className={`submit-error-${index}`}>Err</span>
      )}
    </div>
  );
}

function MountVisibleWidget({ index }: { index: number }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    // Simulate delayed mount activation
    const t = setTimeout(() => setActive(true), 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`stress-widget mount-widget-${index}${active ? " active" : ""}`}
      data-archetype="mount-visible"
      fs-assert={`stress/mount-${index}`}
      fs-trigger="mount"
      fs-assert-visible={`.mount-widget-${index}[classlist=active:true]`}
    >
      {active ? "Active" : "Loading"}
    </div>
  );
}

function InvariantStableWidget({ index }: { index: number }) {
  return (
    <div
      className="stress-widget"
      data-archetype="invariant-stable"
      id={`invariant-${index}`}
      fs-assert={`stress/invariant-${index}`}
      fs-trigger="invariant"
      fs-assert-stable={`#invariant-${index}`}
      fs-assert-timeout="2000"
    >
      Stable content
    </div>
  );
}

function ClickOobWidget({
  index,
  parentKey,
}: {
  index: number;
  parentKey: string;
}) {
  const [count, setCount] = useState(0);
  return (
    <div
      className="stress-widget"
      data-archetype="click-oob"
      fs-assert={`stress/oob-${index}`}
      fs-assert-oob={parentKey}
      fs-assert-updated={`#widget-oob-${index}-content[text-matches=\\d+]`}
    >
      <span id={`widget-oob-${index}-content`}>{count}</span>
      <button onClick={() => setCount((c) => c + 1)}>OOB</button>
    </div>
  );
}

// ── Widget router ────────────���──────────────────────────────────────

function InstrumentedWidget({
  archetype,
  index,
  prevKey,
}: {
  archetype: Archetype;
  index: number;
  prevKey: string | null;
}) {
  switch (archetype) {
    case "click-updated":
      return <ClickUpdatedWidget index={index} />;
    case "click-added":
      return <ClickAddedWidget index={index} />;
    case "click-removed":
      return <ClickRemovedWidget index={index} />;
    case "input-visible":
      return <InputVisibleWidget index={index} />;
    case "submit-conditional":
      return <SubmitConditionalWidget index={index} />;
    case "mount-visible":
      return <MountVisibleWidget index={index} />;
    case "invariant-stable":
      return <InvariantStableWidget index={index} />;
    case "click-oob":
      return (
        <ClickOobWidget
          index={index}
          parentKey={prevKey ?? `stress/updated-0`}
        />
      );
  }
}

// ── Churn grid ──────────────��───────────────────────────────────────
// Generates background DOM mutations without fs-* attributes.
// Simulates third-party widgets, animations, virtual scroll noise.

function ChurnWidget({ index, rate }: { index: number; rate: number }) {
  const [tick, setTick] = useState(0);
  const [children, setChildren] = useState([0]);

  useEffect(() => {
    if (rate <= 0) return;
    const interval = Math.max(1, Math.floor(1000 / rate));
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      // Every 5th tick: add or remove a child node
      setChildren((prev) => {
        if (prev.length > 3) return prev.slice(1);
        return [...prev, prev.length + tick];
      });
    }, interval);
    return () => clearInterval(timer);
  }, [rate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`churn-widget ${tick % 2 === 0 ? "even" : "odd"}`}
      data-tick={tick}
    >
      {children.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

// ── Auto-trigger ────────────────────��───────────────────────────────
// When window.__fsBenchStressTrigger is set, dispatches synthetic events
// on instrumented widgets in round-robin.

function useAutoTrigger() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trigger = useCallback(() => {
    const widgets = document.querySelectorAll(".stress-widget");
    let idx = 0;

    intervalRef.current = setInterval(() => {
      if (!window.__fsBenchStressTrigger) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      if (idx >= widgets.length) idx = 0;
      const widget = widgets[idx];
      const archetype = widget.getAttribute("data-archetype");

      switch (archetype) {
        case "click-updated":
        case "click-added":
        case "click-removed":
        case "click-oob":
          widget.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
          break;
        case "input-visible": {
          const input = widget.querySelector("input");
          if (input) {
            // React synthetic events need native input event + value setter
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value"
            )?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(input, `test-${Date.now()}`);
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          break;
        }
        case "submit-conditional": {
          const form = widget.querySelector("form");
          if (form) {
            form.dispatchEvent(
              new SubmitEvent("submit", { bubbles: true, cancelable: true })
            );
          }
          break;
        }
        // mount-visible and invariant-stable trigger automatically
      }
      idx++;
    }, 100); // ~10 triggers/second
  }, []);

  useEffect(() => {
    // Poll for the trigger flag from the benchmark runner
    const poll = setInterval(() => {
      if (window.__fsBenchStressTrigger && !intervalRef.current) {
        trigger();
      }
    }, 200);
    return () => {
      clearInterval(poll);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [trigger]);
}

// ── App ──────��──────────────────────��───────────────────────────────

export default function App() {
  useAutoTrigger();

  // Build assertion keys for OOB references
  const prevKeys: (string | null)[] = [null];
  for (let i = 0; i < ARCHETYPES.length - 1; i++) {
    const arch = ARCHETYPES[i];
    const prefix =
      arch === "click-updated"
        ? "updated"
        : arch === "click-added"
          ? "added"
          : arch === "click-removed"
            ? "removed"
            : arch === "input-visible"
              ? "input"
              : arch === "submit-conditional"
                ? "submit"
                : arch === "mount-visible"
                  ? "mount"
                  : arch === "invariant-stable"
                    ? "invariant"
                    : "oob";
    prevKeys.push(`stress/${prefix}-${i}`);
  }

  return (
    <div id="stress-root">
      <div id="stress-status">
        Assertions: {ASSERTION_COUNT} | Churn: {CHURN_RATE}/s | Churn nodes:{" "}
        {CHURN_NODES}
      </div>

      <div id="instrumented-grid">
        {ARCHETYPES.map((archetype, i) => (
          <InstrumentedWidget
            key={i}
            archetype={archetype}
            index={i}
            prevKey={prevKeys[i]}
          />
        ))}
      </div>

      {CHURN_RATE > 0 && (
        <div id="churn-grid">
          {Array.from({ length: CHURN_NODES }, (_, i) => (
            <ChurnWidget key={i} index={i} rate={CHURN_RATE / CHURN_NODES} />
          ))}
        </div>
      )}
    </div>
  );
}
