import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'

// Collector mode is driven by VITE_FS_COLLECTOR at build/dev time.
//   unset / "panel"       → panel collector (demo default, visible overlay)
//   "conformance"         → in-page conformance collector used by the
//                           Layer 2 Playwright drivers under conformance/
// The conformance collector is a static file symlinked from
// examples/todolist-tanstack/public/faultsense-conformance-collector.js
// → conformance/shared/collector.js, so the script tag loads the exact
// same bytes every harness uses.
const FS_COLLECTOR: 'panel' | 'conformance' =
  import.meta.env.VITE_FS_COLLECTOR === 'conformance' ? 'conformance' : 'panel'

const collectorScriptSrc =
  FS_COLLECTOR === 'conformance'
    ? '/faultsense-conformance-collector.js'
    : '/faultsense-panel.min.js'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Faultsense Todo Demo' },
    ],
    scripts: [
      // Collector must load before the agent so its registration on
      // window.Faultsense.collectors[name] lands before auto-init resolves
      // `data-collector-url`. Both scripts use defer to execute in document
      // order before DOMContentLoaded.
      { src: collectorScriptSrc, defer: true },
      {
        src: '/faultsense-agent.min.js',
        defer: true,
        id: 'fs-agent',
        'data-release-label': '1.0.0',
        'data-collector-url': FS_COLLECTOR,
        'data-gc-interval': '10000',
        'data-debug': 'true',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
