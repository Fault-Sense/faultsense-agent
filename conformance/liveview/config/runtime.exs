import Config

# Runtime-only config. No-op in this harness since we don't read
# any env vars beyond what config/dev.exs already hardcodes, but
# Phoenix 1.7's `mix phx.server` flow expects this file to exist.
