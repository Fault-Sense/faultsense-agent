# syntax=docker/dockerfile:1.6
#
# Faultsense Hotwire conformance harness.
#
# Rails 8 + turbo-rails on Ruby 3.3-slim. Kept intentionally minimal —
# this image is rebuilt by contributors and CI, so bundle install runs
# once per image build and gem state is cached via BuildKit's cache mount.
#
# The agent bundle at /app/public/faultsense-agent.min.js is a symlink
# to ../../../dist/faultsense-agent.min.js and is bind-mounted at
# runtime by docker-compose so rebuilds of the agent are picked up
# without rebuilding the image.

FROM ruby:3.3-slim

# System deps for native gem builds. Removed at the end of the build
# step to keep the image lean.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
      libyaml-dev \
 && rm -rf /var/lib/apt/lists/*

ENV BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_WITHOUT="development:test" \
    RAILS_ENV=development \
    PORT=3300 \
    PIDFILE=/tmp/server.pid

WORKDIR /app

# Install gems in their own layer so code changes don't invalidate the
# bundle cache. BuildKit cache mount reuses the gem cache across builds.
COPY Gemfile Gemfile.lock* ./
RUN --mount=type=cache,target=/root/.bundle/cache \
    bundle install

# Copy the application. node_modules and .git are excluded via
# .dockerignore. Secrets (master.key) were deleted during scaffolding.
COPY . .

# Rails writes to tmp/pids which doesn't exist in the scaffold.
RUN mkdir -p tmp/pids log && chmod -R 777 tmp log

EXPOSE 3300

HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD curl -fsS http://localhost:3300/up || exit 1

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "3300"]
