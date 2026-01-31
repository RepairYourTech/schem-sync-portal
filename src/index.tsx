import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { FontInstaller } from "./components/FontInstaller";
import { ManualFontGuide } from "./components/ManualFontGuide";
import { FontMissingBanner } from "./components/FontMissingBanner";
import type { InstallResult } from "./lib/fontInstaller";

// Perform hygiene on startup
Logger.rotateLogs("system.log", 5 * 1024 * 1024); // 5MB limit
Logger.rotateLogs("error.log", 2 * 1024 * 1024); // Cleanup legacy log if exists
Logger.rotateLogs("deploy_error.log", 2 * 1024 * 1024); // Cleanup legacy log if exists

import { FlexBVIcon } from "./components/FlexBVIcon";
import { SlimeIcon } from "./components/SlimeIcon";

export type ViewName = "dashboard" | "wizard" | "doctor" | "options" | "sync" | "forensic" | "fontinstaller" | "fontguide";
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
  const tabDirection = useRef<"forward" | "backward" | null>(null);
  const [bodyIndex, setBodyIndex] = useState(0);
  const [doctorIndex, setDoctorIndex] = useState(0);
  const [footerFocus, setFooterFocus] = useState<number | null>(null);
  const { width, height } = useTerminalDimensions();
  const [showFontInstallPrompt, setShowFontInstallPrompt] = useState(false);
  const [fontInstallerReturnView, setFontInstallerReturnView] = useState<ViewName>("doctor");
  const [glyphHighlight, setGlyphHighlight] = useState(false);

  useEffect(() => {
    const runChecks = async () => {
      const currentDeps = await checkDependencies();
      setDeps(currentDeps);

      // 1. Auto-detect Nerd Font version ONLY if missing
      setConfig(prev => {
        if (prev.nerd_font_version === undefined) {
          const detected = currentDeps.recommendedVersion;
          const next = { ...prev, nerd_font_version: detected };
          saveConfig(next); // Side effect inside setter is slightly risky but ensures sync
          Logger.debug("SYSTEM", `Auto-detected Nerd Font v${detected}. Saving.`);
          return next;
        }
        return prev;
      });

      // 2. Font Guard
      const guardStatus = await checkFontGuard(config);
      if (guardStatus.requiresInstallation && !config.nerd_font_auto_install_dismissed) {
        setShowFontInstallPrompt(true);
      }

      if (guardStatus.isInstalled && guardStatus.installedFamily) {
        setConfig(prev => {
          if (prev.nerd_font_installed_family !== (guardStatus.installedFamily || undefined)) {
            const next = {
              ...prev,
              nerd_font_installed_family: guardStatus.installedFamily || undefined,
              nerd_font_last_check: Date.now()
            };
            saveConfig(next);
            return next;
          }
          return prev;
        });
      }
      Logger.debug('SYSTEM', `Font Guard status: ${guardStatus.message}`);
    };

    runChecks();
  }, [view, config.nerd_font_auto_install_dismissed]);

  // Clear tabDirection after use
  useEffect(() => {
    tabDirection.current = null;
  }, [focusArea, view]);

  const activeFontVersion = config.nerd_font_version || 2;

  const handleStartSync = useCallback(() => {
    if (config.source_provider !== "unconfigured" && config.source_provider !== "none" && !isRunning) {
      start(config);
    } else {
      setView("wizard");
    }
  }, [config, isRunning, start]);

  const handleBack = useCallback(() => {
    switch (view) {
      case "options": setView("dashboard"); setFocusArea("body"); break;
      case "doctor": setView("options"); setFocusArea("body"); break;
      case "forensic": setView("options"); setFocusArea("body"); break;
      case "wizard": setBackSignal(prev => prev + 1); break;
      case "fontinstaller":
      case "fontguide":
        setView(fontInstallerReturnView);
        break;
      default: setView("dashboard");
    }
  }, [view, fontInstallerReturnView]);

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
        key: "b", label: "Back", action: handleBack
      });
    }

    if (view !== "dashboard" && view !== "wizard") {
      actions.push({
        key: "b", label: "Back", action: handleBack
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
    if (!key) return;

    // View-specific back navigation priority
    if (key.name === "b" && view !== "dashboard") {
      handleBack();
      return;
    }

    if (view === "doctor" && focusArea === "body") {
      const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
      const showUpgrade = deps?.nerdFontDetailed.version === 2;

      const doctorActions: { key: string; action: () => void }[] = [];
      if (showRepair) doctorActions.push({ key: "r", action: () => { setFontInstallerReturnView("doctor"); setView('fontinstaller'); } });
      if (showUpgrade) doctorActions.push({ key: "u", action: () => { setFontInstallerReturnView("doctor"); setView('fontinstaller'); } });
      doctorActions.push({ key: "t", action: () => { setGlyphHighlight(true); setTimeout(() => setGlyphHighlight(false), 2000); } });
      doctorActions.push({ key: "m", action: () => { setFontInstallerReturnView("doctor"); setView('fontguide'); } });
      doctorActions.push({ key: "b", action: handleBack });

      if (key.name === "left" || key.name === "up") {
        setDoctorIndex(prev => (prev === 0 ? doctorActions.length - 1 : prev - 1));
        return;
      }
      if (key.name === "right" || key.name === "down") {
        setDoctorIndex(prev => (prev === doctorActions.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.name === "return") {
        doctorActions[doctorIndex]?.action();
        return;
      }

      // Hotkey highlight-only SOP
      const hotkeyIdx = doctorActions.findIndex(a => a.key === key.name);
      if (hotkeyIdx !== -1) {
        setDoctorIndex(hotkeyIdx);
        return;
      }
    }

    const isComplete = isConfigComplete(config);
    const isEmpty = isConfigEmpty(config);
    const actions = getFooterActions();
    const bodyActionsCount = isEmpty ? 1 : (!isComplete ? 2 : 1);

    // Navigation (Tab cycles items)
    if (key.name === "tab") {
      if (focusArea === "footer") {
        const actions = getFooterActions();
        if (key.shift) {
          if (footerFocus === 0 || footerFocus === null) {
            tabDirection.current = "backward";
            setFocusArea("body");
            setFooterFocus(null);
            // BACKWARDS into body: go to LAST item
            if (view === "dashboard") setBodyIndex(bodyActionsCount - 1);
            if (view === "doctor") {
              const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
              const showUpgrade = deps?.nerdFontDetailed.version === 2;
              const count = 3 + (showRepair ? 1 : 0) + (showUpgrade ? 1 : 0);
              setDoctorIndex(count - 1);
            }
          } else {
            setFooterFocus(prev => prev! - 1);
          }
        } else {
          if (footerFocus === actions.length - 1) {
            tabDirection.current = "forward";
            setFocusArea("body");
            setFooterFocus(null);
            // FORWARDS into body: go to FIRST item
            if (view === "dashboard") setBodyIndex(0);
            if (view === "doctor") setDoctorIndex(0);
          } else {
            setFooterFocus(prev => (prev === null ? 0 : prev + 1));
          }
        }
        return;
      }
      if (focusArea === "body") {
        if (view === "dashboard") {
          if (key.shift) {
            if (bodyIndex === 0) {
              tabDirection.current = "backward";
              setFocusArea("footer");
            } else setBodyIndex(prev => prev - 1);
          } else {
            if (bodyIndex === bodyActionsCount - 1) {
              tabDirection.current = "forward";
              setFocusArea("footer");
            } else setBodyIndex(prev => prev + 1);
          }
          return;
        }

        if (view === "doctor") {
          const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
          const showUpgrade = deps?.nerdFontDetailed.version === 2;
          const count = 3 + (showRepair ? 1 : 0) + (showUpgrade ? 1 : 0); // r, u, t, m, b

          if (key.shift) {
            if (doctorIndex === 0) {
              tabDirection.current = "backward";
              setFocusArea("footer");
            } else setDoctorIndex(prev => prev - 1);
          } else {
            if (doctorIndex >= count - 1) {
              tabDirection.current = "forward";
              setFocusArea("footer");
            } else setDoctorIndex(prev => prev + 1);
          }
          return;
        }

        if (view === "sync" || view === "fontinstaller" || view === "fontguide") {
          // These views only have one body interaction or are static/guides
          tabDirection.current = key.shift ? "backward" : "forward";
          setFocusArea("footer");
          setFooterFocus(0);
          return;
        }
      }
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
              onSelectionChange={setBodyIndex}
              onFocusChange={setFocusArea}
              onAction={(key) => {
                if (key === "s") {
                  setView("wizard");
                  setWizardMode("restart");
                } else if (key === "c") {
                  setView("wizard");
                  setWizardMode("continue");
                } else if (key === "p") {
                  handleStartSync();
                }
              }}
            />
          </box>
        )}

        {showFontInstallPrompt && view === "dashboard" && (
          <FontMissingBanner
            onInstall={async () => {
              setShowFontInstallPrompt(false);
              setFontInstallerReturnView("dashboard");
              setView('fontinstaller');
            }}
            onSkip={() => {
              setShowFontInstallPrompt(false);
              const newConfig = {
                ...config,
                nerd_font_auto_install_dismissed: true
              };
              setConfig(newConfig);
              saveConfig(newConfig);
            }}
            onLearnMore={() => {
              setShowFontInstallPrompt(false);
              setFontInstallerReturnView("dashboard");
              setView('fontguide');
            }}
          />
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
            tabTransition={tabDirection.current}
            backSignal={backSignal}
          />
        )}

        {view === "options" && (
          <Options
            onDoctor={() => setView("doctor")}
            onSetup={() => { setView("wizard"); setWizardMode("continue"); }}
            onForensic={() => setView("forensic")}
            onReset={onReset}
            onBack={() => setView("dashboard")}
            focusArea={focusArea}
            onFocusChange={setFocusArea}
            tabTransition={tabDirection.current}
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

                <box flexDirection="column" border borderStyle="single" borderColor={colors.border} padding={1} marginTop={1}>
                  <text fg={colors.primary} attributes={TextAttributes.BOLD}>Font Health: {deps.nerdFontDetailed.isInstalled ? "INSTALLED" : "NOT DETECTED"}</text>
                  <text fg={colors.primary}>Detection Method: {deps.nerdFontDetailed.method}</text>
                  <text fg={colors.primary}>Confidence Level: {deps.nerdFontDetailed.confidence}%</text>
                  <text fg={deps.nerdFontDetailed.version === 3 ? colors.success : (deps.nerdFontDetailed.version === 2 ? colors.setup : colors.danger)}>
                    Version: v{deps.nerdFontDetailed.version || "Unknown"}
                  </text>
                  {deps.nerdFontDetailed.installedFonts.length > 0 && (
                    <text fg={colors.dim} attributes={TextAttributes.DIM}>
                      Installed: {deps.nerdFontDetailed.installedFonts.slice(0, 3).join(", ")}
                    </text>
                  )}
                </box>

                <box flexDirection="column" marginTop={1} padding={1} border borderStyle="single" borderColor={colors.border} title="[ FONT MANAGEMENT ]">
                  <box flexDirection="row" gap={2} flexWrap="wrap">
                    {(() => {
                      const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
                      const showUpgrade = deps?.nerdFontDetailed.version === 2;
                      let currentIdx = 0;

                      const elements = [];
                      if (showRepair) {
                        const isFocused = focusArea === "body" && doctorIndex === currentIdx;
                        elements.push(
                          <box
                            key="r"
                            border={isFocused}
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                          >
                            <Hotkey keyLabel="r" label="Repair/Install" isFocused={isFocused} />
                          </box>
                        );
                        currentIdx++;
                      }
                      if (showUpgrade) {
                        const isFocused = focusArea === "body" && doctorIndex === currentIdx;
                        elements.push(
                          <box
                            key="u"
                            border={isFocused}
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                          >
                            <Hotkey keyLabel="u" label="Upgrade to v3" isFocused={isFocused} />
                          </box>
                        );
                        currentIdx++;
                      }

                      const tFocused = focusArea === "body" && doctorIndex === currentIdx;
                      elements.push(
                        <box
                          key="t"
                          border={tFocused}
                          borderStyle="single"
                          borderColor={tFocused ? colors.success : "transparent"}
                          paddingLeft={1}
                          paddingRight={1}
                          height={1}
                        >
                          <Hotkey keyLabel="t" label="Test Glyphs" isFocused={tFocused} />
                        </box>
                      );
                      currentIdx++;

                      const mFocused = focusArea === "body" && doctorIndex === currentIdx;
                      elements.push(
                        <box
                          key="m"
                          onMouseOver={() => {
                            setFocusArea("body");
                            setDoctorIndex(0); // Manual is always 0
                          }}
                          onMouseDown={() => {
                            const url = "https://pldaniels.com/flexbv5/manual.html";
                            spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), [url], { detached: true, stdio: "ignore" });
                          }}
                          border={mFocused}
                          borderStyle="single"
                          borderColor={mFocused ? colors.success : "transparent"}
                          paddingLeft={1}
                          paddingRight={1}
                          height={1}
                        >
                          <Hotkey keyLabel="m" label="Manual Guide" isFocused={mFocused} />
                        </box>
                      );
                      currentIdx++;

                      const bFocused = focusArea === "body" && doctorIndex === currentIdx;
                      elements.push(
                        <box
                          key="b"
                          onMouseOver={() => {
                            setFocusArea("body");
                            setDoctorIndex(1); // Back is 1
                          }}
                          onMouseDown={handleBack}
                          border={bFocused}
                          borderStyle="single"
                          borderColor={bFocused ? colors.success : "transparent"}
                          paddingLeft={1}
                          paddingRight={1}
                          height={1}
                        >
                          <Hotkey keyLabel="b" label="Back" isFocused={bFocused} />
                        </box>
                      );

                      return elements;
                    })()}
                  </box>
                </box>

                <box flexDirection="column" marginTop={1} padding={1} border borderStyle="rounded" borderColor={glyphHighlight ? colors.primary : colors.success} title="[ GLYPH TEST ]">
                  <box flexDirection="column" gap={0}>
                    <box flexDirection="row" gap={2}>
                      <text fg={activeFontVersion === 2 ? colors.success : colors.dim}>[ {'\uf61a'} ] Legacy Cat (v2){activeFontVersion === 2 ? " ★" : ""}</text>
                      <text fg={activeFontVersion === 3 ? colors.success : colors.dim}>[ {'\ueeed'} ] Modern Cat (v3 FA){activeFontVersion === 3 ? " ★" : ""}</text>
                    </box>
                    <box flexDirection="row" gap={2}>
                      <text fg={activeFontVersion === 3 ? colors.success : colors.dim}>[ {'\u{f011b}'} ] MDI Cat (v3 MDI)</text>
                      <text fg={colors.success}>[ {'\uf07b'} ] Folder</text>
                      <text fg={colors.success}>[ {'\ue615'} ] Gear</text>
                    </box>
                  </box>
                  <text marginTop={1} fg={colors.dim} attributes={TextAttributes.DIM}>Identify which cat renders correctly.</text>
                  <text fg={colors.dim} attributes={TextAttributes.DIM}>★ indicates your current preference.</text>
                </box>
              </>
            ) : (
              <text fg={colors.dim}>Running diagnostics...</text>
            )}
          </box>
        )}

        {view === "fontinstaller" && (
          <FontInstaller
            returnView={fontInstallerReturnView}
            onComplete={async (result: InstallResult) => {
              if (result.success) {
                const newConfig = {
                  ...config,
                  nerd_font_version: 3 as const,
                  nerd_font_installed_family: result.installedFamily,
                  nerd_font_last_check: Date.now()
                };
                setConfig(newConfig);
                saveConfig(newConfig);
                // Refresh dependencies
                const newDeps = await checkDependencies();
                setDeps(newDeps);
              }
              setView(fontInstallerReturnView);
            }}
            onCancel={() => setView(fontInstallerReturnView)}
          />
        )}

        {view === "fontguide" && (
          <ManualFontGuide
            returnView={fontInstallerReturnView}
            onClose={() => setView(fontInstallerReturnView)}
          />
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
                  onMouseOver={() => {
                    setFocusArea("footer");
                    setFooterFocus(i);
                  }}
                  onMouseDown={() => action.action()}
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
  exitOnCtrlC: true,
  useMouse: true,
  enableMouseMovement: true
});
createRoot(renderer).render(<App />);
