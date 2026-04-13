// At-rest scrub — removes all fs-* attributes from the DOM and installs a
// MutationObserver to strip them from newly-added nodes. Used in demo mode
// to simulate a page without faultsense instrumentation, matching what a
// customer sees on their own pages (no fs-* attributes anywhere).

(function () {
  function stripFsAttrs(el) {
    if (!el || !el.attributes) return;
    var toRemove = [];
    for (var i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].name.indexOf("fs-") === 0) {
        toRemove.push(el.attributes[i].name);
      }
    }
    for (var j = 0; j < toRemove.length; j++) {
      el.removeAttribute(toRemove[j]);
    }
  }

  function walkAndStrip(root) {
    if (!root) return;
    stripFsAttrs(root);
    var all = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < all.length; i++) {
      stripFsAttrs(all[i]);
    }
  }

  // Strip existing DOM once loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      walkAndStrip(document.body);
    });
  } else {
    walkAndStrip(document.body);
  }

  // Watch for new nodes
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) {
            walkAndStrip(added[j]);
          }
        }
        // Also catch attribute mutations on existing nodes
        if (mutations[i].type === "attributes" && mutations[i].attributeName &&
            mutations[i].attributeName.indexOf("fs-") === 0) {
          mutations[i].target.removeAttribute(mutations[i].attributeName);
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Override setAttribute to intercept fs-* attributes
    var origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (typeof name === "string" && name.indexOf("fs-") === 0) return;
      return origSetAttribute.call(this, name, value);
    };
  }
})();
