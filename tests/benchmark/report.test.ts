import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  median,
  percentile95,
  iqr,
  significanceLabel,
} from "../../tools/benchmark/lib/report";

describe("escapeHtml", () => {
  it("escapes < and > (XSS prevention)", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it("escapes backticks", () => {
    expect(escapeHtml("code `injection`")).toBe("code &#96;injection&#96;");
  });

  it("escapes pipes (Markdown table safety)", () => {
    expect(escapeHtml("cell | value")).toBe("cell &#124; value");
  });

  it("escapes triple-backticks (Markdown fence escape)", () => {
    expect(escapeHtml("```js\nalert(1)\n```")).toBe(
      "&#96;&#96;&#96;js\nalert(1)\n&#96;&#96;&#96;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("round-trips a URL with query params", () => {
    const url = "https://example.com/page?foo=1&bar=<script>";
    const escaped = escapeHtml(url);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).toContain("&amp;");
  });
});

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the middle value for odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("returns the average of two middle values for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("handles single element", () => {
    expect(median([42])).toBe(42);
  });
});

describe("percentile95", () => {
  it("returns 0 for empty array", () => {
    expect(percentile95([])).toBe(0);
  });

  it("returns the max for small arrays", () => {
    expect(percentile95([1, 2, 3])).toBe(3);
  });

  it("returns near-max value for 20-element array", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile95(values)).toBe(19);
  });
});

describe("iqr", () => {
  it("returns 0 for arrays shorter than 4", () => {
    expect(iqr([1, 2, 3])).toBe(0);
  });

  it("computes IQR correctly for a simple range", () => {
    // [1,2,3,4,5,6,7,8] — Q1=arr[2]=3, Q3=arr[6]=7, IQR=4
    expect(iqr([1, 2, 3, 4, 5, 6, 7, 8])).toBe(4);
  });
});

describe("significanceLabel", () => {
  it("returns 'within noise' for small deltas", () => {
    // baseline median=100, IQR=10. threshold = max(10, 5) = 10.
    // delta=5 < 10 → within noise
    expect(significanceLabel(5, 100, 10)).toBe("within noise");
  });

  it("returns 'measurable' for moderate deltas", () => {
    // threshold = max(10, 5) = 10. delta=15 → 10 < 15 < 20 → measurable
    expect(significanceLabel(15, 100, 10)).toBe("measurable");
  });

  it("returns 'significant' for large deltas", () => {
    // threshold = max(10, 5) = 10. delta=25 → 25 >= 20 → significant
    expect(significanceLabel(25, 100, 10)).toBe("significant");
  });

  it("uses 5% of baseline when IQR is smaller", () => {
    // baseline median=1000, IQR=10. threshold = max(10, 50) = 50.
    // delta=30 < 50 → within noise
    expect(significanceLabel(30, 1000, 10)).toBe("within noise");
  });

  it("handles negative deltas", () => {
    // |delta|=5 < threshold=10 → within noise
    expect(significanceLabel(-5, 100, 10)).toBe("within noise");
  });

  it("returns 'within noise' when delta is zero regardless of baseline", () => {
    expect(significanceLabel(0, 0, 0)).toBe("within noise");
    expect(significanceLabel(0, 100, 10)).toBe("within noise");
  });

  it("returns 'significant' when delta is non-zero but baseline and IQR are zero", () => {
    // Any non-zero delta against a zero baseline is significant
    expect(significanceLabel(5, 0, 0)).toBe("significant");
  });
});
