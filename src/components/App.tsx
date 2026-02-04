/** @jsxImportSource @opentui/react */
import React from "react";
import { ThemeProvider } from "../lib/theme";
import { AppContent } from "./AppContent";

export function App() {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
}

App.displayName = "App";
