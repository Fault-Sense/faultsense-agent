/**
 * renderPage — render an EJS page inside the shared layout.
 *
 * If the request is a hx-boost navigation, HTMX swaps the <body> innerHTML
 * of the current page with the response body. We still return the full
 * <html> document so a direct GET (e.g. deep link, refresh) works — HTMX
 * extracts what it needs from <body>.
 */
export function renderPage(res, view, locals = {}) {
  res.render(view, locals, (err, body) => {
    if (err) {
      console.error(err)
      res.status(500).send(err.message)
      return
    }
    res.render('layout', { body, ...locals })
  })
}

/**
 * renderFragment — render an EJS partial without the layout wrapper.
 *
 * Use for HTMX swap responses (todo-item, todo-list, add-error, etc.).
 */
export function renderFragment(res, view, locals = {}) {
  res.render(view, locals)
}
