import Config

# Faultsense LiveView conformance harness — compile-time config.
#
# The endpoint section is shared across environments; the dev-time
# server binding lives in config/dev.exs and config/runtime.exs.

config :faultsense,
  generators: [timestamp_type: :utc_datetime]

config :faultsense, FaultsenseWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: FaultsenseWeb.ErrorHTML],
    layout: false
  ],
  pubsub_server: Faultsense.PubSub,
  live_view: [signing_salt: "faultsense-harness"]

config :phoenix, :json_library, Jason
config :phoenix, :plug_init_mode, :runtime
config :phoenix_live_view, :plug_init_mode, :runtime

import_config "#{config_env()}.exs"
