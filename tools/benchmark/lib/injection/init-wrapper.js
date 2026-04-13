// Init wrapper — calls Faultsense.init() with a noop collector so the agent
// installs its observer, listeners, and GC sweep. Without this the agent is
// inert and idle-soak measurement is meaningless.
//
// Deferred to DOMContentLoaded because document.body must exist before the
// agent can attach its MutationObserver.

(function () {
  function doInit() {
    if (typeof window.Faultsense?.init !== "function") return;

    window.Faultsense.init({
      releaseLabel: "benchmark",
      collectorURL: function () {},
      debug: false,
    });
  }

  if (document.body) {
    doInit();
  } else {
    document.addEventListener("DOMContentLoaded", doInit, { once: true });
  }
})();
