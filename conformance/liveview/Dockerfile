# syntax=docker/dockerfile:1.6
#
# Faultsense LiveView conformance harness.
#
# Phoenix 1.7 + LiveView 1.0 on Elixir 1.17 / OTP 27. Kept minimal —
# no Ecto, no Gettext, no mailer, no asset pipeline. The Phoenix and
# LiveView JS runtimes are copied out of deps/ into priv/static/ so
# the endpoint's Plug.Static can serve them at /phoenix.js and
# /phoenix_live_view.js without an esbuild step.
#
# The agent bundle at /app/priv/static/faultsense-agent.min.js and the
# shared collector at /app/priv/static/collector.js are bind-mounted
# at runtime by docker-compose so agent rebuilds are picked up without
# rebuilding the Elixir image.

FROM hexpm/elixir:1.17.3-erlang-27.3.4.10-debian-bullseye-20260406-slim AS builder

RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      build-essential \
      git \
      curl \
 && rm -rf /var/lib/apt/lists/*

ENV MIX_ENV=dev \
    ERL_AFLAGS="-kernel shell_history enabled"

RUN mix local.hex --force \
 && mix local.rebar --force

WORKDIR /app

# Install hex deps in their own layer so code edits don't invalidate
# the deps cache. The build cache mount reuses the _build dir across
# rebuilds.
COPY mix.exs ./
RUN --mount=type=cache,target=/root/.mix \
    --mount=type=cache,target=/app/deps \
    --mount=type=cache,target=/app/_build \
    mix deps.get && mix deps.compile && \
    cp -r deps /app/deps-final && cp -r _build /app/build-final

# Re-parent the cached trees into the final image so they survive
# layer materialization.
RUN rm -rf deps _build && mv deps-final deps && mv build-final _build

# Copy the application source.
COPY config ./config
COPY lib ./lib

# Pre-create the static assets directory and copy the Phoenix +
# LiveView JS runtimes out of deps/. These are the two pieces of
# client code we need to serve at runtime; everything else in deps/
# stays inside the image for runtime compilation only.
RUN mkdir -p priv/static \
 && cp deps/phoenix/priv/static/phoenix.min.js priv/static/phoenix.js \
 && cp deps/phoenix_live_view/priv/static/phoenix_live_view.min.js priv/static/phoenix_live_view.js

# Compile the app so first-request startup doesn't include a cold
# compile step.
RUN mix compile

EXPOSE 4000

HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=15 \
  CMD curl -fsS http://localhost:4000/up || exit 1

CMD ["mix", "phx.server"]
