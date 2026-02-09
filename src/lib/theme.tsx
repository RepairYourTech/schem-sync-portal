import React, { createContext, useContext, useState, useEffect } from "react";

export interface ThemeColors {
    primary: string;
    setup: string;
    options: string;
    danger: string;
    warning: string;
    success: string;
    dim: string;
    fg: string;
    bg: string;
    border: string;
    accent: string;
    highlight: string;
}

const DarkTheme: ThemeColors = {
    primary: "#00ffff", // Cyan (High Contrast on Black)
    setup: "#ffd700",   // Gold
    options: "#00ff00", // Lime Green
    danger: "#ff5555",  // Bright Red
    warning: "#ffff55", // Bright Yellow
    success: "#00ff00", // Lime
    dim: "#888888",
    fg: "#ffffff",
    bg: "transparent",
    border: "#555555",
    accent: "#00ffff",
    highlight: "#000000" // Black Text on Neon Backgrounds
};

const LightTheme: ThemeColors = {
    primary: "#0000ff", // Pure Blue
    setup: "#b8860b",   // Dark Goldenrod
    options: "#008000", // Green
    danger: "#cc0000",  // Dark Red
    warning: "#cc7a00", // Dark Orange/Yellow
    success: "#008000",
    dim: "#555555",
    fg: "#000000",
    bg: "transparent",
    border: "#000000",
    accent: "#00008b",
    highlight: "#ffffff" // White Text on Dark Backgrounds
};

export type ThemeMode = "dark" | "light";

interface ThemeContextType {
    mode: ThemeMode;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ThemeMode {
    if (typeof process === "undefined") return "dark";

    // Check COLORFGBG environment variable (common in RXVT, stores fg;bg)
    // "15;0" = White FG, Black BG -> Dark
    // "0;15" = Black FG, White BG -> Light
    const colorFgBg = process.env.COLORFGBG || "";
    if (colorFgBg.includes(";15") || colorFgBg.includes(";white")) {
        return "light";
    }

    return "dark"; // Default to dark for safety
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>("dark");

    useEffect(() => {
        setMode(getSystemTheme());
    }, []);

    const colors = mode === "dark" ? DarkTheme : LightTheme;

    return (
        <ThemeContext.Provider value={{ mode, colors }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error("useTheme must be used within ThemeProvider");
    return context;
}
ThemeProvider.displayName = "ThemeProvider";
