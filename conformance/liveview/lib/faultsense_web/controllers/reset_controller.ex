defmodule FaultsenseWeb.ResetController do
  @moduledoc """
  Dev-only reset endpoint used by the Playwright driver in
  `test.beforeEach` to clear the in-memory Store between scenarios.
  Returns 204 No Content.
  """

  use Phoenix.Controller

  alias Faultsense.Store

  def create(conn, _params) do
    Store.reset()
    send_resp(conn, :no_content, "")
  end
end
