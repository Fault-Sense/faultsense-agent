Rails.application.routes.draw do
  # Health endpoint used by the Docker HEALTHCHECK and Playwright's
  # webServer readiness probe.
  get "up" => "rails/health#show", as: :rails_health_check

  root "todos#index"
  resources :todos, only: %i[create destroy] do
    member do
      patch :toggle
    end
    collection do
      # Dev-only reset endpoint used by the Playwright driver to zero
      # out the in-memory store between tests. Not guarded by
      # Rails.env.development? because this container only runs in
      # development.
      post :reset
      # Scenario morph/status-flip — Turbo 8 idiomorph target endpoint.
      post :activate
    end
  end
end
