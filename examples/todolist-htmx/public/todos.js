// Client-side JS for the todos page. Loaded as an external file (not inline)
// so HTMX's boost swap doesn't have to re-evaluate a multi-IIFE inline script,
// which is fragile: adjacent `})();` + `(function...)()` tokens trip ASI and
// the second IIFE is parsed as a call on the first one's return value.
//
// Keeping this in public/todos.js means the file is loaded once at initial
// page load and its listeners survive every hx-boost virtual nav.

(function () {
  // --- Offline banner (pure client-side) ---
  // Re-runs after every hx-boost settle because the body innerHTML swap
  // drops any banner state from the previous view and inserts fresh
  // trigger elements that need the disabled attribute re-applied.
  function renderBanner() {
    var slot = document.getElementById('offline-banner-slot')
    if (slot) {
      slot.innerHTML = navigator.onLine
        ? ''
        : '<div id="offline-banner" class="offline-banner">You are offline. Actions are disabled until connectivity is restored.</div>'
    }
    var toDisable = document.querySelectorAll('[data-offline-disable]')
    for (var i = 0; i < toDisable.length; i++) {
      if (navigator.onLine) toDisable[i].removeAttribute('disabled')
      else toDisable[i].setAttribute('disabled', 'disabled')
    }
  }
  renderBanner()
  window.addEventListener('online', renderBanner)
  window.addEventListener('offline', renderBanner)
  document.body.addEventListener('htmx:afterSettle', renderBanner)

  // --- Activity log + post-add input reset (both listen for todo:added) ---
  var nextLogId = 1
  document.addEventListener('todo:added', function (e) {
    var log = document.getElementById('activity-log')
    if (log) {
      var text = (e.detail && e.detail.text) || 'todo'
      var time = new Date().toLocaleTimeString()
      var entry = document.createElement('div')
      entry.className = 'log-entry'
      entry.dataset.id = String(nextLogId++)
      entry.innerHTML =
        '<span class="time">' + time + '</span>' +
        '<span class="msg">Added: "' + text.replace(/"/g, '&quot;') + '"</span>'
      log.prepend(entry)
      var container = document.getElementById('activity-log-container')
      if (container) container.style.display = ''
      while (log.children.length > 5) log.removeChild(log.lastChild)
    }

    // Clear the add-todo input and reset the char counter after a
    // successful add. HX-Trigger-After-Settle is the clean signal — the
    // form's hx-on::after-request fires for both success and validation
    // errors (both 200), but todo:added only fires on success.
    var input = document.getElementById('add-todo-input')
    if (input) {
      input.value = ''
      input.focus()
    }
    var cc = document.getElementById('char-count')
    if (cc) {
      cc.textContent = '0/100'
      cc.classList.remove('warn')
    }
  })

  // --- Getting started (pure client-side state) ---
  // Delegate from document so the handler survives hx-boost body swaps.
  var completed = new Set()
  document.addEventListener('click', function (e) {
    var container = document.getElementById('getting-started')
    if (!container) return

    var dismiss = e.target.closest('[data-gs-dismiss]')
    if (dismiss && container.contains(dismiss)) {
      container.remove()
      return
    }

    var btn = e.target.closest('[data-gs-done]')
    if (!btn || !container.contains(btn)) return
    var stepId = Number(btn.dataset.gsDone)
    completed.add(stepId)
    var step = container.querySelector('[data-gs-step="' + stepId + '"]')
    if (step) {
      step.classList.add('complete')
      var num = step.querySelector('.step-number')
      if (num) num.textContent = '✓'
    }
    var next = container.querySelector('[data-gs-step="' + (stepId + 1) + '"]')
    if (next) {
      next.classList.remove('locked')
      var body = next.querySelector('[data-gs-body]')
      if (body) body.style.display = ''
    }
    if (completed.size === 3) {
      var allDone = container.querySelector('.all-done')
      if (allDone) allDone.style.display = ''
    }
  })
})()
