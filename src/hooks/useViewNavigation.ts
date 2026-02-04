import { useCallback } from "react";
import type { ViewName } from "./useAppState";

interface NavigationProps {
    view: ViewName;
    setView: (v: ViewName) => void;
    setFocusArea: (area: "body" | "footer") => void;
    setBackSignal: (fn: (prev: number) => number) => void;
    fontInstallerReturnView: ViewName;
    isRunning: boolean;
    stop: () => void;
    handleStartSync: () => void;
}

export function useViewNavigation({
    view, setView, setFocusArea, setBackSignal, fontInstallerReturnView, isRunning, stop, handleStartSync: _handleStartSync
}: NavigationProps) {
    const handleBack = useCallback(() => {
        switch (view) {
            case "options":
                setView("dashboard");
                setFocusArea("body");
                break;
            case "doctor":
                setView("options");
                setFocusArea("body");
                break;
            case "wizard":
                setBackSignal(prev => prev + 1);
                break;
            case "sync":
                if (isRunning) stop();
                setView("dashboard");
                break;
            case "fontinstaller":
            case "fontguide":
                setView(fontInstallerReturnView);
                setFocusArea("body");
                break;
        }
    }, [view, fontInstallerReturnView, isRunning, stop, setView, setFocusArea, setBackSignal]);

    const navigateTo = useCallback((v: ViewName) => {
        setView(v);
        setFocusArea("body");
    }, [setView, setFocusArea]);

    return { handleBack, navigateTo };
}
