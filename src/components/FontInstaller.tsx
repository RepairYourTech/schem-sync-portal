import React, { useState, useCallback } from "react";
import { useTheme } from "../lib/theme";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { installNerdFont, type InstallResult, type NerdFontName } from "../lib/fontInstaller";
import { Hotkey } from "./Hotkey";

interface FontInstallerProps {
    onComplete: (result: InstallResult) => void;
    onCancel: () => void;
}

type InstallState = 'selecting' | 'downloading' | 'installing' | 'success' | 'error';

export function FontInstaller({ onComplete, onCancel }: FontInstallerProps) {
    const { colors } = useTheme();
    const [installState, setInstallState] = useState<InstallState>('selecting');
    const [selectedFont, setSelectedFont] = useState<NerdFontName>('JetBrainsMono');
    const [progress, setProgress] = useState({ stage: '', percent: 0 });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<InstallResult | null>(null);
    const [abortController, setAbortController] = useState<any>(null);

    const fonts: { name: NerdFontName; label: string; desc: string }[] = [
        { name: 'JetBrainsMono', label: 'JetBrains Mono', desc: 'Superior readability, great for code' },
        { name: 'FiraCode', label: 'Fira Code', desc: 'Monospaced with programming ligatures' },
        { name: 'Hack', label: 'Hack', desc: 'Designed for source code' },
        { name: 'Meslo', label: 'Meslo', desc: 'Customized version of Apple Menlo' },
        { name: 'CascadiaCode', label: 'Cascadia Code', desc: 'Microsoft modern monospaced' }
    ];

    const handleInstall = useCallback(async (font: NerdFontName) => {
        const controller = new AbortController() as any;
        setAbortController(controller);
        setInstallState('downloading');

        try {
            const res = await installNerdFont({
                font,
                version: 3,
                signal: controller.signal,
                onProgress: (p) => {
                    if (controller.signal.aborted) return;
                    setProgress(p);
                    if (p.stage === 'installing') setInstallState('installing');
                }
            });

            if (controller.signal.aborted) return;

            setResult(res);
            if (res.success) {
                setInstallState('success');
            } else {
                setError(res.error || 'Unknown error');
                setInstallState('error');
            }
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const message = err instanceof Error ? err.message : String(err);
            setError(message || 'Fatal installation error');
            setInstallState('error');
        } finally {
            setAbortController(null);
        }
    }, [installNerdFont]);

    useKeyboard((key) => {
        if (!key) return;
        if (installState === 'selecting') {
            if (key?.name === 'up') {
                const idx = fonts.findIndex(f => f.name === selectedFont);
                if (idx !== -1) setSelectedFont(fonts[idx === 0 ? fonts.length - 1 : idx - 1].name);
            } else if (key?.name === 'down') {
                const idx = fonts.findIndex(f => f.name === selectedFont);
                if (idx !== -1) setSelectedFont(fonts[idx === fonts.length - 1 ? 0 : idx + 1].name);
            } else if (key?.name === 'return') {
                handleInstall(selectedFont);
            } else if (key?.name === 'escape') {
                onCancel();
            } else if (key?.name && ['1', '2', '3', '4', '5'].includes(key.name)) {
                const idx = parseInt(key.name) - 1;
                if (fonts[idx]) setSelectedFont(fonts[idx].name);
            }
        } else if (installState === 'downloading' || installState === 'installing') {
            if (key?.name === 'escape') {
                if (abortController) {
                    abortController.abort();
                }
                onCancel(); // Abort installation
            }
        } else if (installState === 'success') {
            if (key?.name === 'return') {
                if (result) onComplete(result);
            }
        } else if (installState === 'error') {
            if (key?.name === 'return') {
                setInstallState('selecting');
                setError(null);
            } else if (key?.name === 'escape') {
                onCancel();
            }
        }
    });

    const renderProgressBar = () => {
        const width = 40;
        const filled = Math.floor((progress.percent / 100) * width);
        const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
        return (
            <box flexDirection="column" alignItems="center" marginTop={1}>
                <text fg={colors.primary}>{bar}</text>
                <text fg={colors.fg} marginTop={1}>{progress.stage.toUpperCase()}... {progress.percent}%</text>
            </box>
        );
    };

    return (
        <box
            position="absolute"
            top="10%"
            left="10%"
            width="80%"
            height="auto"
            border
            borderStyle="double"
            borderColor={colors.primary}
            title="[ NERD FONT INSTALLER ]"
            flexDirection="column"
            padding={1}
            backgroundColor={colors.bg}
        >
            {installState === 'selecting' && (
                <box flexDirection="column">
                    <text attributes={TextAttributes.BOLD} marginBottom={1}>Select a Nerd Font to install (v3):</text>
                    {fonts.map((f, i) => {
                        const isSelected = selectedFont === f.name;
                        return (
                            <box key={f.name} flexDirection="row" gap={2}>
                                <text fg={isSelected ? colors.success : colors.dim}>{isSelected ? '●' : '○'}</text>
                                <box flexDirection="column">
                                    <text fg={isSelected ? colors.success : colors.fg} attributes={isSelected ? TextAttributes.BOLD : 0}>
                                        {i + 1}. {f.label}
                                    </text>
                                    <text fg={colors.dim} attributes={TextAttributes.DIM}>   {f.desc}</text>
                                </box>
                            </box>
                        );
                    })}
                    <box flexDirection="row" marginTop={1} gap={2}>
                        <Hotkey keyLabel="enter" label="Install" />
                        <Hotkey keyLabel="esc" label="Cancel" />
                    </box>
                </box>
            )}

            {(installState === 'downloading' || installState === 'installing') && (
                <box flexDirection="column" alignItems="center" padding={2}>
                    <text attributes={TextAttributes.BOLD}>Installing {selectedFont} Nerd Font</text>
                    {renderProgressBar()}
                    <text fg={colors.dim} marginTop={1} attributes={TextAttributes.DIM}>Please do not close the application.</text>
                </box>
            )}

            {installState === 'success' && (
                <box flexDirection="column" alignItems="center" padding={1}>
                    <text fg={colors.success} attributes={TextAttributes.BOLD}>{'\u2714'} SUCCESS!</text>
                    <text marginTop={1}>{selectedFont} Nerd Font has been installed.</text>
                    {result?.requiresRestart && (
                        <text fg={colors.setup} marginTop={1} attributes={TextAttributes.BOLD}>TERMINAL RESTART REQUIRED.</text>
                    )}
                    <box marginTop={1}>
                        <Hotkey keyLabel="enter" label="Complete" />
                    </box>
                </box>
            )}

            {installState === 'error' && (
                <box flexDirection="column" alignItems="center" padding={1}>
                    <text fg={colors.danger} attributes={TextAttributes.BOLD}>INSTALLATION FAILED</text>
                    <text fg={colors.danger} marginTop={1}>{error}</text>
                    <box flexDirection="row" marginTop={1} gap={2}>
                        <Hotkey keyLabel="enter" label="Retry" />
                        <Hotkey keyLabel="esc" label="Cancel" />
                    </box>
                </box>
            )}
        </box>
    );
}
