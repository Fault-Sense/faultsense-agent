defmodule Faultsense.Application do
  @moduledoc """
  OTP application callback for the Faultsense LiveView conformance
  harness. Starts the in-memory todo Store, Phoenix.PubSub, and the
  web endpoint under a one-for-one supervisor.
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Faultsense.Store,
      {Phoenix.PubSub, name: Faultsense.PubSub},
      FaultsenseWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Faultsense.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    FaultsenseWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
