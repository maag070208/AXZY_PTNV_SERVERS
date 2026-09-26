import { ITThemePalette, ITThemeProvider } from "@axzydev/axzy_ui_system";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

localStorage.setItem("it-theme-dark-mode", "light");

// Misma paleta que la web de Puerto Nuevo.
const tema: ITThemePalette = {
  primary: "#0D5777",
  secondary: "#1A7499",
  ternary: "#F0F4F7",
  alert: "#F9C74F",
  warning: "#F9C74F",
  danger: "#BA1A1A",
  info: "#512bbb",
  success: "#4ADE80",
  layout: {
    sidebarBg: "#ffffff",
    sidebarText: "#54634d",
    navbarBg: "#0D5777",
    navbarText: "#ffffff",
  },
  table: {
    headerBg: "#8ab1cf9d",
    headerText: "#0D5777",
    rowBg: "#ffffff",
    rowText: "#1B1B1F",
    rowHover: "#0d5777c4",
  },
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ITThemeProvider theme={tema} showFab={false} density={1}>
      <App />
    </ITThemeProvider>
  </React.StrictMode>
);
