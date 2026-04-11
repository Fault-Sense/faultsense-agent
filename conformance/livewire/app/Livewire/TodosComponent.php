<?php

namespace App\Livewire;

use App\Store;
use Livewire\Attributes\Computed;
use Livewire\Component;

/**
 * Single Livewire 3 component that exercises the full server-rendered
 * conformance scenario set. Every interaction goes through Livewire's
 * wire:click/submit → server re-render → @alpinejs/morph DOM patch
 * pipeline, which is the empirical PAT-04 (morphdom preserved-identity)
 * signal we care about. No Eloquent, no database — state lives in the
 * /tmp JSON file via App\Store so the Laravel dev server can serve
 * requests from short-lived processes without losing state.
 *
 * Scenarios mirror conformance/drivers/livewire.spec.ts:
 *   1. todos/add-item             — wire:submit + conditional mutex
 *   2. todos/toggle-complete      — wire:click → morph patches class (PAT-04)
 *   3. todos/remove-item          — wire:click → morph removes <li>
 *   4. todos/char-count-updated   — input trigger + text-matches
 *   5. layout/empty-state-shown   — mount trigger on server-rendered empty state
 *   6. todos/count-updated        — OOB triggered by every CRUD action
 *   7. layout/title-visible       — invariant
 *   8. morph/status-flip          — wire:click → morph patches #morph-status
 */
class TodosComponent extends Component
{
    public string $draft = '';

    public ?string $errorMessage = null;

    #[Computed]
    public function todos(): array
    {
        return Store::all();
    }

    #[Computed]
    public function active(): bool
    {
        return Store::active();
    }

    #[Computed]
    public function remaining(): int
    {
        return count(array_filter(
            Store::all(),
            fn (array $t): bool => !$t['completed']
        ));
    }

    public function addTodo(): void
    {
        $text = trim($this->draft);
        if ($text === '') {
            $this->errorMessage = 'Todo text is required';
            return;
        }
        $this->errorMessage = null;
        Store::add($text);
        $this->draft = '';
    }

    public function toggleTodo(int $id): void
    {
        Store::toggle($id);
    }

    public function removeTodo(int $id): void
    {
        Store::remove($id);
    }

    public function activate(): void
    {
        // Idempotent: always set to true so the morph/status-flip
        // assertion's expected-next-state is deterministic across
        // driver retries. Mirrors the Hotwire harness's activate
        // action.
        Store::setActive(true);
    }

    public function render()
    {
        return view('livewire.todos-component');
    }
}
