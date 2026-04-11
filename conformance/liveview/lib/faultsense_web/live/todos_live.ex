defmodule FaultsenseWeb.TodosLive do
  @moduledoc """
  Single LiveView that exercises the Faultsense server-rendered
  scenario set against Phoenix LiveView 1.0's morphdom-backed DOM
  patcher. Every `handle_event` updates the Store and re-assigns
  the component; LiveView diffs the rendered HEEx and morphdom patches
  the DOM in place — which is the PAT-04 (morphdom preserved-identity)
  signal captured empirically by `todos/toggle-complete` and
  `morph/status-flip`.
  """

  use FaultsenseWeb, :live_view

  alias Faultsense.Store

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign_state(socket, draft: "", error_message: nil)}
  end

  @impl true
  def handle_event("validate", %{"todo" => %{"text" => text}}, socket) do
    {:noreply, assign(socket, draft: text)}
  end

  def handle_event("add", %{"todo" => %{"text" => text}}, socket) do
    case String.trim(text) do
      "" ->
        {:noreply, assign(socket, error_message: "Todo text is required")}

      trimmed ->
        Store.add(trimmed)
        {:noreply, assign_state(socket, draft: "", error_message: nil)}
    end
  end

  def handle_event("toggle", %{"id" => id}, socket) do
    Store.toggle(String.to_integer(id))
    {:noreply, assign_state(socket)}
  end

  def handle_event("remove", %{"id" => id}, socket) do
    Store.remove(String.to_integer(id))
    {:noreply, assign_state(socket)}
  end

  def handle_event("activate", _params, socket) do
    # Idempotent: always set to true so morph/status-flip's expected-
    # next-state matcher is deterministic across driver retries.
    Store.set_active(true)
    {:noreply, assign_state(socket)}
  end

  defp assign_state(socket, extra \\ []) do
    todos = Store.all()
    remaining = Enum.count(todos, &(not &1.completed))

    socket
    |> assign(
      todos: todos,
      remaining: remaining,
      total: length(todos),
      active: Store.active?()
    )
    |> assign(extra)
  end

  @impl true
  def render(assigns) do
    ~H"""
    <main>
      <%!-- Scenario 7: layout/title-visible — invariant. --%>
      <h1
        id="app-title"
        fs-assert="layout/title-visible"
        fs-trigger="invariant"
        fs-assert-visible="#app-title"
      >
        Faultsense LiveView harness
      </h1>

      <%!--
        Scenario 1: todos/add-item — form submit triggers phx-submit
        which runs `add` above. On success Store.add/1 runs and the
        re-render appends a new <li>. On validation error the
        error_message assign is set and the .add-error slot is
        populated. mutex="conditions" picks one winner.
      --%>
      <form phx-submit="add" phx-change="validate">
        <%!--
          Scenario 4: todos/char-count-updated — phx-change fires on
          every keystroke. The char-count span re-renders via morph.
        --%>
        <input
          id="add-todo-input"
          type="text"
          name="todo[text]"
          value={@draft}
          maxlength="100"
          placeholder="What needs to be done?"
          fs-assert="todos/char-count-updated"
          fs-trigger="input"
          fs-assert-visible="#char-count[text-matches=\d+/100]"
        />
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
        <span id="char-count">{String.length(@draft)}/100</span>
      </form>

      <div id="add-error-slot">
        <p :if={@error_message} class="add-error">{@error_message}</p>
      </div>

      <%!-- Scenario 5: layout/empty-state-shown — mount trigger on the
            server-rendered empty state. Fires exactly once on initial
            page load when the store is empty. --%>
      <section
        :if={@total == 0}
        class="empty-state"
        fs-assert="layout/empty-state-shown"
        fs-trigger="mount"
        fs-assert-visible=".empty-state"
      >
        No todos yet — add one above.
      </section>

      <%!-- Scenario 6: todos/count-updated — OOB on every re-render. --%>
      <div
        id="todo-count"
        fs-assert="todos/count-updated"
        fs-assert-oob="todos/add-item,todos/remove-item,todos/toggle-complete"
        fs-assert-visible="#todo-count[text-matches=\d+ / \d+ remaining]"
      >
        {@remaining} / {@total} remaining
      </div>

      <%!-- Scenarios 2 + 3: toggle + remove buttons. Each <li> gets a
            stable `id` (todo-N) so LiveView's default diffing matches
            nodes across re-renders and morphdom preserves each row's
            DOM identity — which is what todos/toggle-complete's
            fs-assert-updated depends on. --%>
      <ul id="todo-list">
        <li
          :for={todo <- @todos}
          id={"todo-#{todo.id}"}
          class={"todo-item" <> if(todo.completed, do: " completed", else: "")}
          data-id={todo.id}
        >
          <button
            type="button"
            class="toggle-btn"
            phx-click="toggle"
            phx-value-id={todo.id}
            fs-assert="todos/toggle-complete"
            fs-trigger="click"
            fs-assert-updated={".todo-item[data-id='#{todo.id}'][classlist=completed:#{not todo.completed}]"}
            fs-assert-timeout="1500"
          >
            {if todo.completed, do: "☑", else: "☐"}
          </button>
          <span class="text">{todo.text}</span>
          <button
            type="button"
            class="remove-btn"
            phx-click="remove"
            phx-value-id={todo.id}
            fs-assert="todos/remove-item"
            fs-trigger="click"
            fs-assert-removed={".todo-item[data-id='#{todo.id}']"}
            fs-assert-timeout="1500"
          >
            ✕
          </button>
        </li>
      </ul>

      <%!-- Scenario 8: morph/status-flip — morphdom patches
            #morph-status's class and text in place when the `activate`
            event runs. DOM identity is preserved, so the `updated`
            assertion resolves and we get empirical PAT-04 coverage. --%>
      <button
        type="button"
        class="morph-submit"
        phx-click="activate"
        fs-assert="morph/status-flip"
        fs-trigger="click"
        fs-assert-updated="#morph-status[classlist=active:true]"
        fs-assert-timeout="1500"
      >
        Activate (morph)
      </button>
      <div id="morph-status" class={if @active, do: "active", else: "idle"}>
        Active: {@active}
      </div>
    </main>
    """
  end
end
