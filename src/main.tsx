import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "@/app/router";
import { initTheme } from "@/app/theme";
import "@/styles/tailwind.css";
import "@/styles/fonts.css";
import "@/styles/components.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

initTheme();

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
