// Longtask observer — injected via addInitScript before page scripts.
// Pushes entries into window.__fsBench.longtasks from inside the callback
// rather than relying on the PerformanceObserver internal buffer (Blink caps it).

(function () {
  if (typeof window.__fsBench === "undefined") {
    window.__fsBench = { longtasks: [], webVitals: {}, finalized: false };
  }

  if (typeof PerformanceObserver === "undefined") return;

  try {
    var observer = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        window.__fsBench.longtasks.push({
          name: entries[i].name,
          startTime: entries[i].startTime,
          duration: entries[i].duration,
        });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch (e) {
    // longtask not supported in this browser — silently skip
  }
})();
