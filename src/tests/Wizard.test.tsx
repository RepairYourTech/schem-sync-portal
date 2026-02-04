import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import * as opentuiReact from "@opentui/react";
import { Wizard } from "../components/Wizard";
import { mockRender as render, mockThemeColors } from "./ui-test-helpers";
import { EMPTY_CONFIG, type PortalConfig, type PortalProvider } from "../lib/config";

// --- HOOK MOCKING ---
let hookStateIndex = 0;
let hookStateCells: unknown[] = [];
let hookRefIndex = 0;
let hookRefCells: { current: unknown }[] = [];
let hookEffectIndex = 0;
let hookEffectDeps: unknown[][] = [];

mock.module("react", () => ({
    ...React,
    useState: (initial: unknown) => {
        const idx = hookStateIndex++;
        if (hookStateCells[idx] === undefined) hookStateCells[idx] = initial;
        const setState = (val: unknown) => {
            hookStateCells[idx] = typeof val === 'function' ? (val as (prev: unknown) => unknown)(hookStateCells[idx]) : val;
        };
        return [hookStateCells[idx], setState];
    },
    useRef: (initial: unknown) => {
        const idx = hookRefIndex++;
        if (hookRefCells[idx] === undefined) hookRefCells[idx] = { current: initial };
        return hookRefCells[idx];
    },
    useEffect: (fn: () => void, deps?: unknown[]) => {
        const idx = hookEffectIndex++;
        const prevDeps = hookEffectDeps[idx];
        const hasChanged = !prevDeps || !deps || deps.some((d, i) => d !== prevDeps[i]);
        if (hasChanged) {
            hookEffectDeps[idx] = deps || [];
            try { fn(); } catch { }
        }
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useLayoutEffect: () => { },
    useContext: (ctx: { _currentValue: unknown }) => ctx._currentValue,
}));

// Mock useKeyboard to capture the handler
let capturedHandler: (e: { name: string }) => void = () => { };
mock.module("@opentui/react", () => ({
    ...opentuiReact,
    useKeyboard: (handler: (e: { name: string }) => void) => {
        capturedHandler = handler;
    }
}));

// Mock useTheme
mock.module("../lib/theme", () => ({
    useTheme: () => ({ colors: mockThemeColors })
}));

// Mock deploy
mock.module("../lib/deploy", () => ({
    isSystemBootstrapped: () => false,
    bootstrapSystem: mock(() => Promise.resolve())
}));

// Mock useWizardAuth
const mockDispatchDirectAuth = mock((_provider: string) => { });

mock.module("../hooks/useWizardAuth", () => ({
    useWizardAuth: (props: {
        updateConfig: (fn: (prev: PortalConfig) => PortalConfig) => void;
        wizardContext: "source" | "dest";
        next: () => void;
    }) => ({
        handleAuth: mock(() => { }),
        handleGdriveAuth: mock(() => { }),
        startGenericAuth: mock(() => { }),
        dispatchDirectAuth: (provider: string) => {
            mockDispatchDirectAuth(provider);
            props.updateConfig((prev: PortalConfig) => ({
                ...prev,
                [props.wizardContext === "source" ? "source_provider" : "backup_provider"]: provider as PortalProvider,
                local_dir: "/tmp/sync",
                upsync_enabled: true,
                enable_malware_shield: true
            }));
            props.next();
        },
        refs: {
            urlRef: { current: "" },
            userRef: { current: "" },
            passRef: { current: "" },
            clientIdRef: { current: "" },
            clientSecretRef: { current: "" },
            b2IdRef: { current: "" },
            b2KeyRef: { current: "" }
        }
    })
}));

describe("Wizard Behavioral Tests", () => {
    let mockOnComplete: (config: PortalConfig) => void;
    let mockOnUpdate: (config: PortalConfig) => void;
    let mockOnCancel: () => void;

    beforeEach(() => {
        mockOnComplete = mock((_config: PortalConfig) => { });
        mockOnUpdate = mock((_config: PortalConfig) => { });
        mockOnCancel = mock(() => { });
        mockDispatchDirectAuth.mockClear();
        hookStateIndex = 0;
        hookStateCells = [];
        hookRefIndex = 0;
        hookRefCells = [];
        hookEffectIndex = 0;
        hookEffectDeps = [];
    });

    const renderWizard = (props: Partial<React.ComponentProps<typeof Wizard>> = {}) => {
        hookStateIndex = 0;
        hookRefIndex = 0;
        hookEffectIndex = 0;
        return render(
            React.createElement(Wizard, {
                initialConfig: EMPTY_CONFIG,
                mode: "restart",
                onComplete: mockOnComplete,
                onCancel: mockOnCancel,
                onQuit: () => { },
                onUpdate: mockOnUpdate,
                focusArea: "body",
                onFocusChange: () => { },
                backSignal: 0,
                tabTransition: "forward",
                ...props
            })
        );
    };

    const runAction = (name: string, props: Partial<React.ComponentProps<typeof Wizard>> = {}) => {
        capturedHandler({ name });
        renderWizard(props);
    };

    it("should select source provider and trigger onUpdate when return is pressed", () => {
        renderWizard();
        runAction("return"); // Skip Shortcut
        runAction("down");   // To gdrive
        runAction("return"); // Select gdrive
        expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ source_provider: 'gdrive' }));
    });

    it("should handle backSignal by calling onCancel when at initial step", () => {
        renderWizard({ backSignal: 0 });
        renderWizard({ backSignal: 1 });
        expect(mockOnCancel).toHaveBeenCalled();
    });

    it("should trigger dispatchDirectAuth and update config for backup provider", () => {
        renderWizard();
        runAction("return"); // Skip shortcut
        runAction("down");   // Source choice -> GDrive
        runAction("return");
        runAction("down");   // GDrive Intro -> Direct
        runAction("return");
        runAction("return"); // Direct 1
        runAction("return"); // Direct 2
        runAction("return"); // Direct 3 -> moves to dir
        runAction("return"); // Dir
        runAction("return"); // Mirror
        runAction("down");   // Upsync -> Yes
        runAction("return"); // moves to dest_cloud_select
        runAction("down");   // Dest Selection -> B2
        runAction("return"); // Confirm B2 -> moves to b2_intro
        runAction("down");   // B2 Intro -> Direct
        runAction("return"); // moves to cloud_direct_entry (dest)
        runAction("return"); // Direct 1
        runAction("return"); // Direct 2
        runAction("return"); // Direct 3 -> calls dispatchDirectAuth('b2')

        expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ backup_provider: 'b2' }));
    });
    it("should trigger dispatchDirectAuth and update config for S3 source provider", () => {
        renderWizard();
        runAction("return"); // Skip shortcut
        // Select S3 (9th down)
        for (let i = 0; i < 9; i++) runAction("down");
        runAction("return"); // Select S3 -> s3_intro

        runAction("down");   // s3_intro -> Direct
        runAction("return"); // moves to cloud_direct_entry
        runAction("return");
        runAction("return");
        runAction("return"); // calls dispatchDirectAuth('s3')

        expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ source_provider: 's3' }));
    });
});


