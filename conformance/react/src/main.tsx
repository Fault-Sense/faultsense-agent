import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// StrictMode is intentional — it double-invokes effects in dev to
// surface cleanup bugs, which gives us light coverage of PAT-05
// (detach-reattach) against a real React reconciler.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
