defmodule FaultsenseWeb do
  @moduledoc """
  Web namespace for the Faultsense LiveView conformance harness.
  Provides the `router`, `live_view`, and `html` macros used by the
  router and LiveView modules. Copied straight from the `phx.new`
  generator output and trimmed to the two macros this harness uses.
  """

  def router do
    quote do
      use Phoenix.Router, helpers: false

      import Plug.Conn
      import Phoenix.Controller
      import Phoenix.LiveView.Router
    end
  end

  def live_view do
    quote do
      # No `layout:` option. The pipeline's `put_root_layout` already
      # installs the root layout for the initial HTTP render; adding an
      # inner layout here would double-wrap the component in another
      # `<html>` shell.
      use Phoenix.LiveView

      unquote(html_helpers())
    end
  end

  def html do
    quote do
      use Phoenix.Component

      import Phoenix.HTML
      import Phoenix.LiveView.Helpers

      unquote(html_helpers())
    end
  end

  defp html_helpers do
    quote do
      import Phoenix.HTML
      alias Phoenix.LiveView.JS
    end
  end

  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
