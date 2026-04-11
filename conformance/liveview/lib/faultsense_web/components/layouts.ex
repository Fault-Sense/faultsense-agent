defmodule FaultsenseWeb.Layouts do
  @moduledoc """
  HTML root layout for the conformance harness. Loads the Faultsense
  agent + collector in `<head>` so the agent's init-time scan picks up
  the LiveView's server-rendered fs-* attributes, then loads
  Phoenix/LiveView JS and initialises the LiveSocket so user
  interactions trigger server round-trips.
  """

  use FaultsenseWeb, :html

  embed_templates "layouts/*"
end
