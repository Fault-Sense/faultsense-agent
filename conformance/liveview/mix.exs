defmodule Faultsense.MixProject do
  @moduledoc """
  Mix project file for the Faultsense LiveView conformance harness.

  Targets Phoenix 1.7 + LiveView 1.0 on Elixir 1.17 / OTP 27. No Ecto,
  no Gettext, no mailer — this app only serves a single LiveView and
  holds state in an in-memory Agent.
  """

  use Mix.Project

  def project do
    [
      app: :faultsense,
      version: "0.1.0",
      elixir: "~> 1.17",
      elixirc_paths: ["lib"],
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      mod: {Faultsense.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  defp deps do
    [
      {:phoenix, "~> 1.7.14"},
      {:phoenix_html, "~> 4.1"},
      {:phoenix_live_view, "~> 1.0"},
      {:jason, "~> 1.2"},
      {:bandit, "~> 1.5"}
    ]
  end
end
