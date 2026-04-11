<?php

/**
 * Laravel front controller — entry point for the Faultsense Livewire
 * conformance harness. Bootstraps the application, lets it handle the
 * current HTTP request, and sends the response.
 */

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';

/** @var Illuminate\Foundation\Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
