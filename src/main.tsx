import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SettingsApplier } from "@/components/SettingsApplier";
import { ThemeApplier } from "@/components/ThemeApplier";
import { ThemeProvider } from "@/components/ThemeProvider";
import { queryClient } from "@/queryClient";
import { router } from "@/routes";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ThemeApplier>
          <SettingsApplier>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </SettingsApplier>
        </ThemeApplier>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
