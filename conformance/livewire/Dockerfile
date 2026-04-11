# syntax=docker/dockerfile:1.6
#
# Faultsense Livewire conformance harness.
#
# Laravel 11 + Livewire 3 on PHP 8.3-cli. Kept minimal — no apache/nginx,
# no database; state lives in /tmp via App\Store's JSON file and Laravel's
# built-in `artisan serve` command is the web server.
#
# The agent bundle at /app/public/faultsense-agent.min.js and the shared
# collector at /app/public/collector.js are bind-mounted at runtime by
# docker-compose so agent rebuilds are picked up without rebuilding the
# image.

FROM php:8.3-cli-bookworm

# System deps + composer. libzip/unzip are required for composer's zip
# archive handling (composer defaults to --prefer-dist which downloads
# package zips). Installed via the official composer image copy-across
# so we don't need to curl the installer.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      git \
      libzip-dev \
      unzip \
      curl \
 && docker-php-ext-install zip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1

WORKDIR /app

# Install PHP deps in their own layer so code edits don't invalidate
# the vendor cache. BuildKit cache mount reuses composer's HTTP cache
# across builds.
COPY composer.json ./
RUN --mount=type=cache,target=/tmp/composer-cache \
    COMPOSER_CACHE_DIR=/tmp/composer-cache \
    composer install --no-dev --prefer-dist --no-progress --no-scripts

# Copy the application after vendor is in place.
COPY . .

# Laravel needs writable storage + bootstrap/cache directories. Create
# them here so the image ships ready to run regardless of which dirs
# the repo shipped.
RUN mkdir -p \
      storage/framework/cache \
      storage/framework/sessions \
      storage/framework/views \
      storage/logs \
      bootstrap/cache \
 && chmod -R 777 storage bootstrap/cache

# Laravel needs APP_KEY set (exactly 32 bytes decoded, for AES-256-CBC)
# even for a harness that doesn't touch sessions or cookies. Hardcoded
# here because this container only runs in a sealed test environment —
# there is nothing this key would protect.
ENV APP_KEY=base64:aFR12pSJc1vKHsjyWKwSzBAl+0siHne37VrQdusQE8c= \
    APP_ENV=local \
    APP_DEBUG=true \
    APP_URL=http://localhost:3900 \
    LOG_CHANNEL=stderr \
    SESSION_DRIVER=array \
    CACHE_STORE=array \
    QUEUE_CONNECTION=sync

EXPOSE 3900

HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD curl -fsS http://localhost:3900/up || exit 1

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=3900"]
