defmodule FaultsenseWeb.HealthController do
  @moduledoc """
  Health endpoint consumed by Docker's HEALTHCHECK and Playwright's
  webServer readiness probe. Always returns 200 "OK".
  """

  use Phoenix.Controller

  def show(conn, _params) do
    conn
    |> put_resp_content_type("text/plain")
    |> send_resp(200, "OK")
  end
end
