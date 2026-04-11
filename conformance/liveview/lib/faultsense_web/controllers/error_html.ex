defmodule FaultsenseWeb.ErrorHTML do
  @moduledoc """
  HTML error fallback for the conformance harness. `render_errors`
  in config/config.exs points at this module, and Phoenix calls
  `render/2` with a template name like "404.html" when an error
  renders an HTML response. We don't need rich error pages here —
  the driver only ever hits the happy-path routes.
  """

  use FaultsenseWeb, :html

  def render(template, _assigns) do
    Phoenix.Controller.status_message_from_template(template)
  end
end
