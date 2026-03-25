import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Faultsense Todo Demo' },
    ],
    scripts: [
      // Panel collector must load before agent so it registers on
      // window.Faultsense.collectors.panel before auto-init resolves it.
      // Both use defer to ensure execution in document order before DOMContentLoaded.
      { src: '/faultsense-panel.min.js', defer: true },
      {
        src: '/faultsense-agent.min.js',
        defer: true,
        id: 'fs-agent',
        'data-release-label': '1.0.0',
        'data-collector-url': 'panel',
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
