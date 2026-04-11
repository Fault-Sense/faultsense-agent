defmodule Faultsense.Store do
  @moduledoc """
  In-memory todo store. Backed by an `Agent` so all LiveView processes
  share the same state and the Playwright driver can wipe it via the
  POST /reset endpoint between scenarios.

  Mirrors conformance/hotwire/app/controllers/todos_controller.rb's
  Store class one-to-one so the shared driver runners see the same
  affordances (ids, completed flag, active flag).
  """

  use Agent

  @type todo :: %{id: integer(), text: String.t(), completed: boolean()}

  @initial_state %{todos: [], next_id: 1, active: false}

  def start_link(_opts) do
    Agent.start_link(fn -> @initial_state end, name: __MODULE__)
  end

  @spec all() :: [todo()]
  def all, do: Agent.get(__MODULE__, & &1.todos)

  @spec active?() :: boolean()
  def active?, do: Agent.get(__MODULE__, & &1.active)

  @spec set_active(boolean()) :: :ok
  def set_active(value) do
    Agent.update(__MODULE__, &Map.put(&1, :active, value))
  end

  @spec add(String.t()) :: todo()
  def add(text) do
    Agent.get_and_update(__MODULE__, fn state ->
      todo = %{id: state.next_id, text: text, completed: false}

      new_state =
        state
        |> Map.update!(:todos, &(&1 ++ [todo]))
        |> Map.update!(:next_id, &(&1 + 1))

      {todo, new_state}
    end)
  end

  @spec toggle(integer()) :: :ok
  def toggle(id) do
    Agent.update(__MODULE__, fn state ->
      todos =
        Enum.map(state.todos, fn
          %{id: ^id} = todo -> %{todo | completed: not todo.completed}
          other -> other
        end)

      %{state | todos: todos}
    end)
  end

  @spec remove(integer()) :: :ok
  def remove(id) do
    Agent.update(__MODULE__, fn state ->
      %{state | todos: Enum.reject(state.todos, &(&1.id == id))}
    end)
  end

  @spec reset() :: :ok
  def reset do
    Agent.update(__MODULE__, fn _state -> @initial_state end)
  end
end
