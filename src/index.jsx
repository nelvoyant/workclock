import "./init";
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import mondaySdk from "monday-sdk-js";
import SettingsView from "./views/SettingsView.jsx";

const monday = mondaySdk();
const root = createRoot(document.getElementById("root"));

// async function renderByMode() {
//   try {
//     const ctx = await monday.get("context");
//     const mode = ctx?.data?.viewMode; // "board" | "fullScreen" | "settings"
//     console.log("WorkClock view mode:", mode);

//     if (mode === "settings") {
//       root.render(<SettingsView />);
//     } else {
//       root.render(<App />);
//     }
//   } catch (err) {
//     console.error("Failed to get context:", err);
//     root.render(<App />);
//   }
// }

async function renderByMode() {
  const ctx = await monday.get("context");
  const mode = ctx?.data?.viewMode; // "board" | "settings" | "fullScreen" | undefined
  const isAccountSettings = ctx?.data?.instanceType === "account_settings_view";

  if (mode === "settings" || isAccountSettings) {
    root.render(<SettingsView />);
  } else {
    root.render(<App />);
  }
}

// Initial render based on current iframe mode
renderByMode();

// If the user clicks the gear, Monday fires a "settings" event.
// Only switch to Settings if the iframe is actually in settings mode.
monday.listen("settings", async () => {
  const ctx = await monday.get("context");
  const mode = ctx?.data?.viewMode;
  console.log("Settings event received. Current mode:", mode);
  if (mode === "settings") {
    root.render(<SettingsView />);
  }
});

// If context changes back to board/fullScreen, render the main app again.
monday.listen("context", ({ data }) => {
  const mode = data?.viewMode;
  if (mode && mode !== "settings") {
    root.render(<App />);
  }
});

// CRA default
serviceWorker.unregister();
