import Config

# Dev-time HTTP server config. The Docker entrypoint runs the app in
# `MIX_ENV=dev`, so this is effectively the production config for the
# harness container — there is no separate prod build.
config :faultsense, FaultsenseWeb.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: 4000],
  check_origin: false,
  code_reloader: false,
  debug_errors: true,
  secret_key_base: "faultsense-harness-secret-key-base-64-bytes-minimum-pad-pad-pad",
  watchers: [],
  live_reload: [patterns: []]

# Keep logs quiet so they don't drown Playwright's stderr pipe.
config :logger, level: :warning
config :phoenix, :stacktrace_depth, 20
