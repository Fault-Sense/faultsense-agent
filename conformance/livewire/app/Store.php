<?php

namespace App;

/**
 * In-memory todo store for the Faultsense Livewire conformance harness.
 *
 * This harness runs Laravel's built-in development server (`php artisan
 * serve`), which serves requests through PHP-FPM-style short-lived
 * processes. That means static class state does NOT survive across
 * requests. We therefore persist the store to a tiny JSON file on
 * every mutation — the file lives under /tmp inside the container and
 * is wiped when the Playwright driver hits POST /todos/reset at the
 * start of each test.
 *
 * Kept as a plain static class (no Eloquent, no database) so the
 * harness has zero schema setup and maps one-to-one to the
 * conformance/hotwire/ Store class.
 */
class Store
{
    private const STATE_FILE = '/tmp/livewire-harness-state.json';

    public static function all(): array
    {
        return self::load()['todos'];
    }

    public static function active(): bool
    {
        return self::load()['active'];
    }

    public static function setActive(bool $value): void
    {
        $state = self::load();
        $state['active'] = $value;
        self::save($state);
    }

    public static function add(string $text): array
    {
        $state = self::load();
        $todo = [
            'id' => $state['next_id'],
            'text' => $text,
            'completed' => false,
        ];
        $state['next_id']++;
        $state['todos'][] = $todo;
        self::save($state);
        return $todo;
    }

    public static function toggle(int $id): void
    {
        $state = self::load();
        foreach ($state['todos'] as &$todo) {
            if ($todo['id'] === $id) {
                $todo['completed'] = !$todo['completed'];
                break;
            }
        }
        unset($todo);
        self::save($state);
    }

    public static function remove(int $id): void
    {
        $state = self::load();
        $state['todos'] = array_values(array_filter(
            $state['todos'],
            fn (array $t): bool => $t['id'] !== $id
        ));
        self::save($state);
    }

    public static function reset(): void
    {
        self::save(['todos' => [], 'next_id' => 1, 'active' => false]);
    }

    private static function load(): array
    {
        if (!file_exists(self::STATE_FILE)) {
            return ['todos' => [], 'next_id' => 1, 'active' => false];
        }
        $raw = file_get_contents(self::STATE_FILE);
        $decoded = json_decode($raw, true);
        return is_array($decoded)
            ? $decoded
            : ['todos' => [], 'next_id' => 1, 'active' => false];
    }

    private static function save(array $state): void
    {
        file_put_contents(self::STATE_FILE, json_encode($state));
    }
}
