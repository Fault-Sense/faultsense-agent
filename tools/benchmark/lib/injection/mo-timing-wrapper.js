// MutationObserver callback timing instrumentation.
// Must be injected BEFORE the faultsense agent so it wraps the constructor
// before the agent calls `new MutationObserver(...)`.
//
// Wraps every MO callback with performance.now() timing and pushes
// durations directly into window.__fsBench.moTimings.
(function () {
  var OriginalMO = window.MutationObserver;

  window.__fsBench = window.__fsBench || {
    longtasks: [],
    webVitals: {},
    finalized: false,
  };
  window.__fsBench.moTimings = [];

  function TimedMutationObserver(callback) {
    var timings = window.__fsBench.moTimings;
    var wrappedCallback = function (mutations, observer) {
      var start = performance.now();
      callback(mutations, observer);
      var end = performance.now();
      timings.push({ durationMs: end - start });
    };
    return new OriginalMO(wrappedCallback);
  }

  // Preserve prototype chain so instanceof checks still work
  TimedMutationObserver.prototype = OriginalMO.prototype;
  Object.setPrototypeOf(TimedMutationObserver, OriginalMO);

  window.MutationObserver = TimedMutationObserver;
})();
