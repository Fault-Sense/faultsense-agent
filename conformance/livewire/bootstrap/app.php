<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

/**
 * Laravel 11 bootstrap — configures the application container, routes,
 * middleware, and exception handling. Deliberately tiny: no API routes,
 * no console kernel, no scheduled tasks. This harness only needs to
 * serve a single Livewire component.
 */
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // The Playwright driver POSTs to /todos/reset without a CSRF
        // token — this harness runs in a sealed Docker container, so
        // there is nothing to protect. Disable CSRF verification
        // globally rather than excluding a single route.
        $middleware->validateCsrfTokens(except: ['*']);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
