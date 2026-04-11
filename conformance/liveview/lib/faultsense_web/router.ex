defmodule FaultsenseWeb.Router do
  @moduledoc """
  Routes for the Faultsense LiveView conformance harness.

    * `GET  /`            — mounts TodosLive (the single scenario-bearing LiveView)
    * `POST /todos/reset` — clears the in-memory Store (driver beforeEach)
    * `GET  /up`          — health check consumed by Docker HEALTHCHECK
  """

  use FaultsenseWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :put_root_layout, html: {FaultsenseWeb.Layouts, :root}
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json", "html"]
  end

  scope "/", FaultsenseWeb do
    pipe_through :browser

    live "/", TodosLive
    get "/up", HealthController, :show
  end

  scope "/", FaultsenseWeb do
    pipe_through :api

    post "/todos/reset", ResetController, :create
  end
end
