<?php

use App\Store;
use Illuminate\Support\Facades\Route;

/**
 * Faultsense Livewire conformance routes.
 *
 * Only three endpoints:
 *   GET  /           — renders the Livewire harness page
 *   POST /todos/reset — clears the in-memory store (driver beforeEach)
 *   GET  /up          — health check used by Docker HEALTHCHECK
 */

Route::view('/', 'harness')->name('harness');

Route::post('/todos/reset', function () {
    Store::reset();
    return response()->noContent();
})->name('todos.reset');

Route::get('/up', fn () => response('OK', 200));
