import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyAppearance, readAppearance } from "./appearance";
import { applySidebar, readSidebar } from "./sidebar";
import "./themes.css";
import "./style.css";
applyAppearance(readAppearance());
applySidebar(readSidebar());
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

