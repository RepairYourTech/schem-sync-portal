/** @jsxImportSource @opentui/react */
import React, { useState, useCallback } from "react";
import { useTheme } from "../lib/theme";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { installNerdFont, type InstallResult, type NerdFontName } from "../lib/fontInstaller";
import { Hotkey } from "./Hotkey";
import { type ViewName } from "../index";

interface FontInstallerProps {
    returnView: ViewName;
    onComplete: (result: InstallResult) => void;
    onCancel: () => void;
}

type InstallState = 'selecting' | 'downloading' | 'installing' | 'success' | 'error';

export function FontInstaller({ returnView: _returnView, onComplete, onCancel }: FontInstallerProps) {
    const { colors } = useTheme();
    const [installState, setInstallState] = useState<InstallState>('selecting');
    const [selectedFont, setSelectedFont] = useState<NerdFontName>('JetBrainsMono');
    const [progress, setProgress] = useState({ stage: '', percent: 0 });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<InstallResult | null>(null);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    const fonts: { name: NerdFontName; label: string; desc: string }[] = [
        { name: 'JetBrainsMono', label: 'JetBrains Mono', desc: 'Superior readability, great for code' },
        { name: 'FiraCode', label: 'Fira Code', desc: 'Monospaced with programming ligatures' },
        { name: 'Hack', label: 'Hack', desc: 'Designed for source code' },
        { name: 'Meslo', label: 'Meslo', desc: 'Customized version of Apple Menlo' },
        { name: 'CascadiaCode', label: 'Cascadia Code', desc: 'Microsoft modern monospaced' }
    ];

    const handleInstall = useCallback(async (font: NerdFontName) => {
        const controller = new AbortController();
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
                if (idx !== -1) {
                    const nextIdx = idx === 0 ? fonts.length - 1 : idx - 1;
                    const nextFont = fonts[nextIdx];
                    if (nextFont) setSelectedFont(nextFont.name);
                }
            } else if (key?.name === 'down') {
                const idx = fonts.findIndex(f => f.name === selectedFont);
                if (idx !== -1) {
                    const nextIdx = idx === fonts.length - 1 ? 0 : idx + 1;
                    const nextFont = fonts[nextIdx];
                    if (nextFont) setSelectedFont(nextFont.name);
                }
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


    return (
        <box
            border
            borderStyle="double"
            borderColor={colors.primary}
            title="[ NERD FONT INSTALLER ]"
            flexDirection="column"
            padding={2}
            backgroundColor={colors.bg}
            flexGrow={1}
        >
            {installState === 'selecting' ? (
                <box flexDirection="column" gap={1}>
                    <text fg={colors.fg}>Select a font family to install:</text>
                    <box flexDirection="column" gap={0}>
                        {fonts.map((f, i) => {
                            const isSelected = selectedFont === f.name;
                            return (
                                <box
                                    key={f.name}
                                    onMouseOver={() => setSelectedFont(f.name)}
                                    onMouseDown={() => handleInstall(f.name)}
                                    flexDirection="row"
                                    gap={2}
                                >
                                    <text fg={isSelected ? colors.success : colors.dim}>{String(isSelected ? '●' : '○')}</text>
                                    <box flexDirection="column">
                                        <text fg={isSelected ? colors.success : colors.fg} attributes={isSelected ? TextAttributes.BOLD : 0}>
                                            {String(i + 1)}. {String(f.label)}
                                        </text>
                                        <text fg={colors.dim} attributes={TextAttributes.DIM}>   {String(f.desc)}</text>
                                    </box>
                                </box>
                            );
                        })}
                    </box>
                    <box flexDirection="row" marginTop={1} gap={2}>
                        <box
                            onMouseDown={() => handleInstall(selectedFont)}
                            border
                            borderStyle="single"
                            borderColor={colors.success}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="enter" label="Install" isFocused />
                        </box>
                        <box
                            onMouseDown={() => onCancel()}
                            border
                            borderStyle="single"
                            borderColor={colors.danger}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="esc" label="Cancel" />
                        </box>
                    </box>
                </box>
            ) : null}

            {(installState === 'downloading' || installState === 'installing') ? (
                <box flexDirection="column" gap={1} alignItems="center" justifyContent="center" flexGrow={1}>
                    <text fg={colors.accent} attributes={TextAttributes.BOLD}>
                        {String(installState === 'downloading' ? 'Downloading...' : 'Installing...')}
                    </text>
                    <text fg={colors.dim}>[{String("█".repeat(Math.floor((progress.percent / 100) * 20)))}{String("░".repeat(20 - Math.floor((progress.percent / 100) * 20)))}] {String(progress.percent)}%</text>
                    <text fg={colors.dim} marginTop={1}>Press ESC to cancel</text>
                </box>
            ) : null}

            {installState === 'success' ? (
                <box flexDirection="column" gap={1} alignItems="center" justifyContent="center" flexGrow={1}>
                    <text fg={colors.success} attributes={TextAttributes.BOLD}>SUCCESS!</text>
                    <text fg={colors.fg} marginTop={1}>{String(result?.error || 'Font installed successfully.')}</text>
                    {result?.requiresRestart ? (
                        <text fg={colors.setup} attributes={TextAttributes.BOLD} marginTop={1}>TERMINAL RESTART REQUIRED.</text>
                    ) : null}
                    <box marginTop={2}
                        onMouseDown={() => result && onComplete(result)}
                        border
                        borderStyle="single"
                        borderColor={colors.success}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="enter" label="Complete" isFocused />
                    </box>
                </box>
            ) : null}

            {installState === 'error' ? (
                <box flexDirection="column" gap={1} alignItems="center" justifyContent="center" flexGrow={1}>
                    <text fg={colors.danger} attributes={TextAttributes.BOLD}>INSTALLATION FAILED</text>
                    <text fg={colors.danger} marginTop={1}>{String(error)}</text>
                    <box flexDirection="row" marginTop={2} gap={2}>
                        <box
                            onMouseDown={() => {
                                setInstallState('selecting');
                                setError(null);
                            }}
                            border
                            borderStyle="single"
                            borderColor={colors.success}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="enter" label="Retry" isFocused />
                        </box>
                        <box
                            onMouseDown={() => onCancel()}
                            border
                            borderStyle="single"
                            borderColor={colors.danger}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="esc" label="Cancel" />
                        </box>
                    </box>
                </box>
            ) : null}
        </box>
    );
}
