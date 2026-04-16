// 👇 NY KODE ØVERST
window.addEventListener("error", (event) => {
  if (
    event?.message?.includes("LockManager") ||
    event?.message?.includes("navigator.locks")
  ) {
    event.preventDefault();
    console.warn("Suppressed error:", event.message);
  }
});

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
