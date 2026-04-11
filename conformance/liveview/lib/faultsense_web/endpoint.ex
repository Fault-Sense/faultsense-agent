defmodule FaultsenseWeb.Endpoint do
  @moduledoc """
  Phoenix endpoint — the top-level Plug pipeline for HTTP and LiveView
  WebSocket traffic. The Plug.Static entry serves:

    * `/phoenix.js` and `/phoenix_live_view.js` — the Phoenix +
      LiveView client runtimes, copied from deps/ at image build time.
    * `/collector.js` — the shared conformance collector, bind-mounted
      from conformance/shared/collector.js at runtime.
    * `/faultsense-agent.min.js` — the Faultsense agent bundle,
      bind-mounted from dist/ at runtime.

  Every static asset is whitelisted explicitly so a request for an
  unrelated path doesn't leak filesystem contents.
  """

  use Phoenix.Endpoint, otp_app: :faultsense

  # LiveView websocket. No `connect_info: [session: ...]` because this
  # harness doesn't use Plug.Session — adding it would require a
  # session store key in the socket config. Cookie-less LiveView is
  # fine; the harness never authenticates anyone.
  socket "/live", Phoenix.LiveView.Socket,
    websocket: true,
    longpoll: true

  plug Plug.Static,
    at: "/",
    from: :faultsense,
    gzip: false,
    only: ~w(collector.js faultsense-agent.min.js phoenix.js phoenix_live_view.js)

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head

  plug FaultsenseWeb.Router
end
