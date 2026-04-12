// Web-vitals collector — wires onLCP, onCLS, onFCP, onTTFB, onINP callbacks
// into window.__fsBench.webVitals. Sets finalized = true when LCP + CLS have
// reported (they finalize on pagehide/visibilitychange).
//
// Depends on web-vitals IIFE being injected before this script.

(function () {
  if (typeof window.__fsBench === "undefined") {
    window.__fsBench = { longtasks: [], webVitals: {}, finalized: false };
  }

  // web-vitals v4 IIFE exposes webVitals global
  var wv = window.webVitals;
  if (!wv) return;

  var reported = { lcp: false, cls: false };

  function checkFinalized() {
    if (reported.lcp && reported.cls) {
      window.__fsBench.finalized = true;
    }
  }

  wv.onLCP(function (metric) {
    window.__fsBench.webVitals.lcp = metric.value;
    reported.lcp = true;
    checkFinalized();
  });

  wv.onCLS(function (metric) {
    window.__fsBench.webVitals.cls = metric.value;
    reported.cls = true;
    checkFinalized();
  });

  wv.onINP(function (metric) {
    window.__fsBench.webVitals.inp = metric.value;
  });

  wv.onFCP(function (metric) {
    window.__fsBench.webVitals.fcp = metric.value;
  });

  wv.onTTFB(function (metric) {
    window.__fsBench.webVitals.ttfb = metric.value;
  });
})();
