import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import React, { useState, useEffect, useCallback } from "react";
import { spawn } from "child_process";
import { Splash } from "./components/Splash";
import { Dashboard } from "./components/Dashboard";
import { Wizard } from "./components/Wizard";
import { Options } from "./components/Options";
import { ForensicView } from "./components/ForensicView";
import { SyncPortal } from "./components/SyncPortal";
import { ThemeProvider, useTheme } from "./lib/theme";
import { loadConfig, saveConfig, isConfigComplete, isConfigEmpty, type PortalConfig } from "./lib/config";
import { useSync } from "./hooks/useSync";
import { checkDependencies, type DependencyStatus } from "./lib/doctor";
import { checkFontGuard } from "./lib/fontGuard";
import { Env } from "./lib/env";
import { Logger } from "./lib/logger";
import { Hotkey } from "./components/Hotkey";

// Perform hygiene on startup
Logger.rotateLogs("system.log", 5 * 1024 * 1024); // 5MB limit
Logger.rotateLogs("error.log", 2 * 1024 * 1024); // Cleanup legacy log if exists
Logger.rotateLogs("deploy_error.log", 2 * 1024 * 1024); // Cleanup legacy log if exists

import { FlexBVIcon } from "./components/FlexBVIcon";
import { SlimeIcon } from "./components/SlimeIcon";

type ViewName = "dashboard" | "wizard" | "doctor" | "options" | "sync" | "forensic";
type WizardMode = "continue" | "restart";
type FocusArea = "body" | "footer";

function AppContent() {
  const [config, setConfig] = useState<PortalConfig>(loadConfig());
  const [view, setView] = useState<ViewName>("dashboard");
  const [wizardMode, setWizardMode] = useState<WizardMode>("continue");
  const [backSignal, setBackSignal] = useState(0);

  const { colors } = useTheme();
  const [deps, setDeps] = useState<DependencyStatus | null>(null);
  const renderer = useRenderer();
  const { progress, isRunning, start, stop } = useSync();

  const [focusArea, setFocusArea] = useState<FocusArea>("body");
  const [bodyIndex, setBodyIndex] = useState(0);
  const [footerFocus, setFooterFocus] = useState<number | null>(null);
  const { width, height } = useTerminalDimensions();
  const [showFontInstallPrompt, setShowFontInstallPrompt] = useState(false);

  useEffect(() => {
    const runChecks = async () => {
      const currentDeps = await checkDependencies();
      setDeps(currentDeps);

      // Auto-detect Nerd Font version if not set
      if (config.nerd_font_version === undefined) {
        const detected = currentDeps.recommendedVersion;
        const newConfig = { ...config, nerd_font_version: detected };
        setConfig(newConfig);
        saveConfig(newConfig);
        Logger.debug("SYSTEM", `Auto-detected Nerd Font v${detected} environment. Saving preference.`);
      }

      const guardStatus = await checkFontGuard(config);
      if (guardStatus.requiresInstallation && !config.nerd_font_auto_install_dismissed) {
        setShowFontInstallPrompt(true);
      }

      if (guardStatus.isInstalled && guardStatus.installedFamily) {
        const newConfig = {
          ...config,
          nerd_font_installed_family: guardStatus.installedFamily,
          nerd_font_last_check: Date.now()
        };
        setConfig(newConfig);
        saveConfig(newConfig);
      }
      Logger.debug('SYSTEM', `Font Guard status: ${guardStatus.message}`);
    };

    runChecks();
  }, [view, config.nerd_font_auto_install_dismissed]);

  const activeFontVersion = config.nerd_font_version || 2;

  const handleStartSync = useCallback(() => {
    if (config.source_provider !== "none" && !isRunning) {
      start(config);
    } else if (config.source_provider === "none") {
      setView("wizard");
    }
  }, [config, isRunning, start]);

  const hasConfig = config.source_provider !== "none";

  const getFooterActions = useCallback(() => {
    const actions: { key: string; label: string; action: () => void }[] = [];

    // Core Contextual Actions
    if (view === "dashboard" && !isRunning) {
      actions.push({
        key: "o", label: "Options", action: () => {
          setView("options");
          setFocusArea("body");
        }
      });
    }

    if (view === "wizard") {
      actions.push({
        key: "b", label: "Back", action: () => setBackSignal(prev => prev + 1)
      });
    }

    if (view !== "dashboard") {
      actions.push({
        key: "h", label: "Home", action: () => {
          if (isRunning) stop();
          setView("dashboard");
          setFocusArea("body");
        }
      });
    }

    // Always include Exit as the final action
    actions.push({ key: "escape", label: "Exit", action: () => renderer.destroy() });

    return actions;
  }, [view, isRunning, stop, renderer]);

  useKeyboard((key) => {
    const isComplete = isConfigComplete(config);
    const isEmpty = isConfigEmpty(config);
    const actions = getFooterActions();
    const bodyActionsCount = isEmpty ? 1 : (!isComplete ? 2 : 1);

    // Navigation (Tab cycles areas)
    if (key.name === "tab") {
      // simplified 2-way cycle: Body <-> Footer
      setFocusArea(prev => prev === "body" ? "footer" : "body");
      if (focusArea !== "footer") setFooterFocus(0);
      else setFooterFocus(null);
      return;
    }

    // Directional Navigation
    if (focusArea === "footer") {
      if (key.name === "left" || key.name === "up") {
        setFooterFocus(prev => (prev === null || prev === 0) ? actions.length - 1 : prev - 1);
        return;
      } else if (key.name === "right" || key.name === "down") {
        setFooterFocus(prev => (prev === null || prev === actions.length - 1) ? 0 : prev + 1);
        return;
      } else if (key.name === "return" && footerFocus !== null) {
        actions[footerFocus]?.action();
        return;
      }

      // Quick hotkey support when footer is focused
      const quickAction = actions.find(a => a.key === key.name);
      if (quickAction) {
        quickAction.action();
        return;
      }
    }

    // Support numeric selection (1-9) ONLY if body is focused
    const isNumeric = /^[1-9]$/.test(key.name);
    if (isNumeric && focusArea === "body") {
      if (view === "options" || view === "wizard") {
        // We let the child component handle the actual index update
      }
    }

    if (focusArea === "body" && view === "dashboard") {
      if (key.name === "left" || key.name === "up") {
        setBodyIndex(prev => (prev === 0 ? bodyActionsCount - 1 : prev - 1));
      } else if (key.name === "right" || key.name === "down") {
        setBodyIndex(prev => (prev === bodyActionsCount - 1 ? 0 : prev + 1));
      } else if (key.name === "return") {
        if (isEmpty) { // Begin [S]etup
          setWizardMode("restart");
          setView("wizard");
        } else if (!isComplete) {
          if (bodyIndex === 0) {
            setWizardMode("continue");
          } else {
            setWizardMode("restart");
          }
          setView("wizard");
        } else { // Sync [P]ortal
          setView("sync");
        }
      }

      // Hotkey = SELECT ONLY (In Dashboard)
      if (!isRunning) {
        if (key.name === "s") {
          setBodyIndex(isEmpty ? 0 : 1);
        }
        if (key.name === "c" && !isEmpty && !isComplete) {
          setBodyIndex(0);
        }
        if (key.name === "p" && isComplete) {
          setBodyIndex(0);
        }
      }
    }

    // Global Action Hotkeys (Only if footer is focused)
    if (focusArea === "footer") {
      if (key.name === "o") {
        const idx = actions.findIndex(a => a.key === "o");
        if (idx !== -1) setFooterFocus(idx);
      }
      if (key.name === "h") {
        const idx = actions.findIndex(a => a.key === "h");
        if (idx !== -1) setFooterFocus(idx);
      }
    }

    if (key.name === "escape") {
      // 2-Step Logic: ESC always shifts focus to the footer's exit action
      const escIndex = actions.findIndex(a => a.key === "escape");
      if (escIndex !== -1) {
        setFocusArea("footer");
        setFooterFocus(escIndex);
        return;
      }
      return;
    }
  });

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const onWizardComplete = useCallback((newConfig: PortalConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
    setView("dashboard");
  }, [renderer]);

  const onReset = useCallback(async () => {
    const deploy = await import("./lib/deploy");
    deploy.removeSystemBootstrap();

    const { removePortalConfig, removeLegacySource } = await import("./lib/rclone");
    // Surgically remove ONLY the portal-related remotes.
    // This protects the user's OS backup storage (Project A).
    removePortalConfig([
      Env.REMOTE_PORTAL_SOURCE,
      Env.REMOTE_PORTAL_BACKUP,
      "gdrive_portal" // Legacy support
    ]);
    removeLegacySource();

    try {
      const { unlinkSync } = await import("fs");
      unlinkSync("/tmp/portal_auth.log");
    } catch { }

    const configM = await import("./lib/config");
    configM.clearConfig();
    setConfig(configM.EMPTY_CONFIG);
    setWizardMode("restart");
    setView("dashboard");
    setFocusArea("body");
  }, []);


  const onUpdateWizard = useCallback((newConfig: PortalConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const onCancelWizard = useCallback(() => setView("dashboard"), []);
  const onQuitWizard = useCallback(() => renderer.destroy(), [renderer]);

  return (
    <box flexDirection="column" height={height} width={width} backgroundColor="transparent" padding={1}>
      {/* BODY AREA */}
      <box flexDirection="column" flexGrow={1} paddingBottom={1}>
        {view === "dashboard" && !isRunning && <Splash />}

        {view === "dashboard" && (
          <box flexShrink={0}>
            <Dashboard
              config={config}
              isFocused={focusArea === "body"}
              selectedIndex={bodyIndex}
            />
          </box>
        )}

        {view === "sync" && (
          <SyncPortal
            config={config}
            progress={progress}
            isRunning={isRunning}
            onStop={stop}
            onStart={handleStartSync}
            configLoaded={hasConfig}
            focusArea={focusArea}
            onFocusChange={setFocusArea}
          />
        )}

        {view === "wizard" && (
          <Wizard
            initialConfig={config}
            mode={wizardMode}
            onUpdate={onUpdateWizard}
            onComplete={onWizardComplete}
            onCancel={onCancelWizard}
            onQuit={onQuitWizard}
            focusArea={focusArea}
            onFocusChange={setFocusArea}
            backSignal={backSignal}
          />
        )}

        {view === "options" && (
          <Options
            onDoctor={() => setView("doctor")}
            onSetup={() => { setView("wizard"); setWizardMode("restart"); }}
            onForensic={() => setView("forensic")}
            onReset={onReset}
            onBack={() => setView("dashboard")}
            focusArea={focusArea}
            onFocusChange={setFocusArea}
            config={config}
            onUpdateConfig={(newConfig) => {
              saveConfig(newConfig);
              setConfig(newConfig);
            }}
          />
        )}

        {view === "forensic" && (
          <ForensicView
            targetDir={config.local_dir && config.local_dir !== "none" ? config.local_dir : ""}
            gdriveRemote={config.source_provider === "gdrive" ? Env.REMOTE_PORTAL_SOURCE : (config.backup_provider === "gdrive" ? Env.REMOTE_PORTAL_BACKUP : null)}
            onComplete={() => setView("options")}
            onCancel={() => setView("options")}
          />
        )}

        {view === "doctor" && (
          <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM DIAGNOSTICS ]" gap={1}>
            {deps ? (
              <>
                <text fg={deps.bun ? colors.success : colors.danger}>Bun Runtime: {deps.bun || "MISSING"}</text>
                <text fg={deps.zig ? colors.success : colors.danger}>Zig Compiler: {deps.zig || "MISSING"}</text>
                <text fg={deps.rclone ? colors.success : colors.danger}>Rclone Sync: {deps.rclone || "MISSING"}</text>
                <text fg={deps.archive ? colors.success : colors.danger}>Archive Engines (7z/RAR): {deps.archive || "MISSING"}</text>
                <text fg={colors.primary}>Font Health: {deps.nerdFont}</text>
                <text fg={colors.primary}>Recommended Version: v{deps.recommendedVersion}</text>
                <text fg={colors.primary}>Free Disk Space: {deps.diskSpace}</text>

                <box flexDirection="column" marginTop={1} padding={1} border borderStyle="rounded" borderColor={colors.success} title="[ GLYPH TEST ]">
                  <box flexDirection="column" gap={0}>
                    <box flexDirection="row" gap={2}>
                      <text fg={activeFontVersion === 2 ? colors.success : colors.dim}>[ {'\uf61a'} ] Legacy Cat (v2){activeFontVersion === 2 ? " ★" : ""}</text>
                      <text fg={activeFontVersion === 3 ? colors.success : colors.dim}>[ {'\ueeed'} ] Modern Cat (v3 FA){activeFontVersion === 3 ? " ★" : ""}</text>
                    </box>
                    <box flexDirection="row" gap={2}>
                      <text fg={activeFontVersion === 3 ? colors.success : colors.dim}>[ {'\uf011b'} ] MDI Cat (v3 MDI)</text>
                      <text fg={colors.success}>[ {'\uf07b'} ] Folder</text>
                      <text fg={colors.success}>[ {'\ue615'} ] Gear</text>
                    </box>
                  </box>
                  <text marginTop={1} fg={colors.dim} attributes={TextAttributes.DIM}>Identify which cat renders correctly. Switch versions in Options.</text>
                  <text fg={colors.dim} attributes={TextAttributes.DIM}>★ indicates your current preference.</text>
                </box>
              </>
            ) : (
              <text fg={colors.dim}>Running diagnostics...</text>
            )}
          </box>
        )}
      </box>

      {/* FOOTER AREA - Precisely 10 lines to prevent overlap */}
      <box border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="column" height={10} flexShrink={0} width="100%">
        <box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%" height={3}>
          <box flexDirection="column">
            <box flexDirection="row" alignItems="center" gap={1}>
              <FlexBVIcon />
              <text
                onMouseDown={() => {
                  const url = "https://pldaniels.com/flexbv5/";
                  spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), [url], { detached: true, stdio: "ignore" });
                }}
                fg="#3a7af5"
                attributes={TextAttributes.UNDERLINE}
              >
                Best Used With FlexBV
              </text>
            </box>
            <box flexDirection="row" alignItems="center" gap={1}>
              <SlimeIcon version={activeFontVersion} />
              <text
                onMouseDown={() => {
                  const url = "https://slimeinacloak.github.io/crypto";
                  spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), [url], { detached: true, stdio: "ignore" });
                }}
                fg="#ffff00"
                attributes={TextAttributes.UNDERLINE}
              >
                Buy Slime A Coffee
              </text>
            </box>
          </box>

          <box flexDirection="row" gap={2}>
            {getFooterActions().map((action, i) => {
              const isFocused = focusArea === "footer" && footerFocus === i;

              return (
                <box
                  key={i}
                  border={isFocused}
                  borderStyle="single"
                  borderColor={isFocused ? (action.key === "escape" ? colors.danger : colors.success) : "transparent"}
                  paddingLeft={1}
                  paddingRight={1}
                  height={1}
                >
                  <Hotkey
                    keyLabel={action.key === "escape" ? "ESC" : action.key}
                    label={action.label}
                    isFocused={isFocused}
                  />
                </box>
              );
            })}
          </box>
        </box>

        <box alignSelf="center" marginTop={1} flexDirection="column" alignItems="center" width="100%">
          <text attributes={TextAttributes.DIM} fg={colors.dim}>TAB: Cycle Areas | ARROWS: Navigate | ENTER: Select</text>
          <text attributes={TextAttributes.DIM} fg={colors.dim}>Hotkey + ENTER to confirm</text>
        </box>
      </box>
    </box>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true
});
createRoot(renderer).render(<App />);
