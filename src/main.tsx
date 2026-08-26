import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { assertClientEnv } from "./lib/config";

// Fail fast if the app was built without env config (see .env.example).
assertClientEnv();

// Register the service worker (precache + push handler). autoUpdate picks up
// new builds in the background.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
