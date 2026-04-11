<main>
    {{-- Scenario 7: layout/title-visible — invariant. --}}
    <h1
        id="app-title"
        fs-assert="layout/title-visible"
        fs-trigger="invariant"
        fs-assert-visible="#app-title"
    >
        Faultsense Livewire harness
    </h1>

    {{-- Scenario 1: todos/add-item — wire:submit goes through
         Livewire's round trip (server validates, updates Store,
         re-renders, client morph-patches). On success .todo-item
         appends; on failure the .add-error slot is populated. --}}
    <form wire:submit="addTodo">
        {{-- Scenario 4: todos/char-count-updated — fs-trigger="input"
             fires on every keystroke, and the text-matches modifier
             on #char-count validates the counter span's live text. --}}
        <input
            id="add-todo-input"
            type="text"
            wire:model.live="draft"
            maxlength="100"
            placeholder="What needs to be done?"
            fs-assert="todos/char-count-updated"
            fs-trigger="input"
            fs-assert-visible="#char-count[text-matches=\d+/100]"
        >
        <button
            type="submit"
            fs-assert="todos/add-item"
            fs-trigger="click"
            fs-assert-mutex="conditions"
            fs-assert-added-success=".todo-item"
            fs-assert-added-error=".add-error"
            fs-assert-timeout="1500"
        >
            Add
        </button>
        <span id="char-count">{{ strlen($draft) }}/100</span>
    </form>

    {{-- Conditional mutex error slot for todos/add-item. --}}
    <div id="add-error-slot">
        @if ($errorMessage)
            <p class="add-error">{{ $errorMessage }}</p>
        @endif
    </div>

    {{-- Scenario 5: layout/empty-state-shown — mount trigger on the
         server-rendered empty state. Fires exactly once on initial
         page load when the store is empty. --}}
    @if (count($this->todos) === 0)
        <section
            class="empty-state"
            fs-assert="layout/empty-state-shown"
            fs-trigger="mount"
            fs-assert-visible=".empty-state"
        >
            No todos yet — add one above.
        </section>
    @endif

    {{-- Scenario 6: todos/count-updated — OOB triggered by every CRUD
         action that updates the component. Livewire re-renders and
         morph patches the text in place. --}}
    <div
        id="todo-count"
        fs-assert="todos/count-updated"
        fs-assert-oob="todos/add-item,todos/remove-item,todos/toggle-complete"
        fs-assert-visible="#todo-count[text-matches=\d+ / \d+ remaining]"
    >
        {{ $this->remaining }} / {{ count($this->todos) }} remaining
    </div>

    {{-- Scenarios 2 + 3: per-todo toggle + remove buttons. wire:key
         pins each <li>'s identity during morph so toggle-complete's
         fs-assert-updated resolves against the SAME element. --}}
    <ul id="todo-list">
        @foreach ($this->todos as $todo)
            <li
                wire:key="todo-{{ $todo['id'] }}"
                class="todo-item{{ $todo['completed'] ? ' completed' : '' }}"
                data-id="{{ $todo['id'] }}"
            >
                <button
                    type="button"
                    class="toggle-btn"
                    wire:click="toggleTodo({{ $todo['id'] }})"
                    fs-assert="todos/toggle-complete"
                    fs-trigger="click"
                    fs-assert-updated=".todo-item[data-id='{{ $todo['id'] }}'][classlist=completed:{{ $todo['completed'] ? 'false' : 'true' }}]"
                    fs-assert-timeout="1500"
                >
                    {{ $todo['completed'] ? '☑' : '☐' }}
                </button>
                <span class="text">{{ $todo['text'] }}</span>
                <button
                    type="button"
                    class="remove-btn"
                    wire:click="removeTodo({{ $todo['id'] }})"
                    fs-assert="todos/remove-item"
                    fs-trigger="click"
                    fs-assert-removed=".todo-item[data-id='{{ $todo['id'] }}']"
                    fs-assert-timeout="1500"
                >
                    ✕
                </button>
            </li>
        @endforeach
    </ul>

    {{-- Scenario 8: morph/status-flip — Livewire's @alpinejs/morph
         patches #morph-status's `class` attribute and inner text in
         place when the component re-renders. DOM identity is
         preserved, so fs-assert-updated (not fs-assert-added) resolves
         and we get empirical PAT-04 coverage. The activate action is
         idempotent (always sets active=true) so the expected-next-
         state matcher is deterministic across retries. --}}
    <button
        type="button"
        class="morph-submit"
        wire:click="activate"
        fs-assert="morph/status-flip"
        fs-trigger="click"
        fs-assert-updated="#morph-status[classlist=active:true]"
        fs-assert-timeout="1500"
    >
        Activate (morph)
    </button>
    <div id="morph-status" class="{{ $this->active ? 'active' : 'idle' }}">
        Active: {{ $this->active ? 'true' : 'false' }}
    </div>
</main>
