// Init wrapper — calls Faultsense.init() with a noop collector so the agent
// installs its observer, listeners, and GC sweep. Without this the agent is
// inert and idle-soak measurement is meaningless.

(function () {
  if (typeof window.Faultsense?.init !== "function") return;

  window.Faultsense.init({
    releaseLabel: "benchmark",
    collectorURL: function () {},
    debug: false,
  });
})();
