class TodosController < ApplicationController
  # POST requests from the Playwright driver don't carry a CSRF token,
  # so skip CSRF verification for this harness. This is a test-only
  # Rails app running in a sealed Docker container — there is nothing
  # to protect.
  skip_before_action :verify_authenticity_token

  # In-memory store. This harness is single-process (Puma solo mode in
  # config/puma.rb), so a class-level array is safe across requests for
  # the lifetime of the container. Restart the container between test
  # runs if you want a fresh slate.
  class Store
    @@todos = []
    @@next_id = 1
    @@active = false
    @@mutex = Mutex.new

    def self.all = @@mutex.synchronize { @@todos.dup }

    def self.active? = @@mutex.synchronize { @@active }
    def self.set_active(val) = @@mutex.synchronize { @@active = val }

    def self.add(text)
      @@mutex.synchronize do
        todo = { id: @@next_id, text: text, completed: false }
        @@next_id += 1
        @@todos << todo
        todo
      end
    end

    def self.remove(id)
      @@mutex.synchronize { @@todos.reject! { _1[:id] == id.to_i } }
    end

    def self.toggle(id)
      @@mutex.synchronize do
        todo = @@todos.find { _1[:id] == id.to_i }
        todo[:completed] = !todo[:completed] if todo
        todo
      end
    end

    def self.find(id)
      @@mutex.synchronize { @@todos.find { _1[:id] == id.to_i } }
    end

    def self.reset!
      @@mutex.synchronize do
        @@todos = []
        @@next_id = 1
        @@active = false
      end
    end
  end

  def index
    @todos = Store.all
    @active = Store.active?
  end

  def create
    text = params.dig(:todo, :text).to_s.strip
    if text.empty?
      # Error response: Turbo Stream that replaces the error slot with a
      # visible error message. The add-item conditional mutex distinguishes
      # this from the success path.
      render turbo_stream: turbo_stream.replace(
        "add-error-slot",
        partial: "todos/error",
        locals: { message: "Todo text is required" }
      ), status: :unprocessable_entity
      return
    end

    @todo = Store.add(text)
    # Success response: append the new todo to the list AND refresh the
    # count + clear the error slot. Multiple Turbo Stream actions in one
    # response so the browser applies them in one mutation batch.
    render turbo_stream: [
      turbo_stream.append("todo-list", partial: "todos/todo", locals: { todo: @todo }),
      turbo_stream.replace("todo-count", partial: "todos/count", locals: { todos: Store.all }),
      turbo_stream.replace("add-error-slot", "<div id=\"add-error-slot\"></div>".html_safe)
    ]
  end

  def toggle
    @todo = Store.toggle(params[:id])
    # turbo_stream.replace swaps the <li id="todo-N"> for a fresh render
    # with the flipped `completed` class — exercises the outerHTML
    # replacement pattern (PAT-03) against a real Turbo response.
    render turbo_stream: [
      turbo_stream.replace("todo-#{@todo[:id]}", partial: "todos/todo", locals: { todo: @todo }),
      turbo_stream.replace("todo-count", partial: "todos/count", locals: { todos: Store.all })
    ]
  end

  def destroy
    Store.remove(params[:id])
    render turbo_stream: [
      turbo_stream.remove("todo-#{params[:id]}"),
      turbo_stream.replace("todo-count", partial: "todos/count", locals: { todos: Store.all })
    ]
  end

  # Dev-only: clear the in-memory store so Playwright tests can assert
  # against a known-empty state (see the empty-state scenario).
  def reset
    Store.reset!
    head :no_content
  end

  # Scenario morph/status-flip — Turbo 8 idiomorph (PAT-04 empirical).
  # turbo_stream.replace with method: :morph patches the target node's
  # attributes and text in place instead of the default childList swap.
  # Always sets the state to active=true so the morph is idempotent and
  # the assertion's expected-next-state is deterministic across retries.
  def activate
    Store.set_active(true)
    render turbo_stream: turbo_stream.replace(
      "morph-status",
      partial: "todos/morph_status",
      locals: { active: true },
      method: :morph
    )
  end
end
