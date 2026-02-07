/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import * as opentuiReact from "@opentui/react";
import { WizardContainer } from "../components/wizard/WizardContainer";
import { mockRender as render, mockThemeColors } from "./ui-test-helpers";
import { EMPTY_CONFIG, type PortalConfig, type PortalProvider } from "../lib/config";

// --- ROBUST HOOK MOCKING (SINGLE COMPONENT FOCUS) ---
let hookCursor = 0;
let hookStateCells: unknown[] = [];
let hookRefCells: { current: unknown }[] = [];
let hookEffectDeps: unknown[][] = [];
let hookCallbackDeps: unknown[][] = [];
let hookMemoDeps: unknown[][] = [];
let hookCallbackCells: unknown[] = [];
let hookMemoCells: unknown[] = [];

mock.module("react", () => ({
    ...React,
    useState: (initial: unknown) => {
        const idx = hookCursor++;
        if (hookStateCells[idx] === undefined) hookStateCells[idx] = initial;
        const setState = (val: unknown) => {
            hookStateCells[idx] = typeof val === 'function' ? (val as (prev: unknown) => unknown)(hookStateCells[idx]) : val;
        };
        return [hookStateCells[idx], setState];
    },
    useRef: (initial: unknown) => {
        const idx = hookCursor++;
        if (hookRefCells[idx] === undefined) hookRefCells[idx] = { current: initial };
        return hookRefCells[idx];
    },
    useEffect: (fn: () => void, deps?: unknown[]) => {
        const idx = hookCursor++;
        const prevDeps = hookEffectDeps[idx];
        const hasChanged = !prevDeps || !deps || deps.some((d, i) => d !== prevDeps[i]);
        if (hasChanged) {
            hookEffectDeps[idx] = deps || [];
            try { fn(); } catch { }
        }
    },
    useCallback: (fn: unknown, deps?: unknown[]) => {
        const idx = hookCursor++;
        const prevDeps = hookCallbackDeps[idx];
        const hasChanged = !prevDeps || !deps || deps.some((d, i) => d !== prevDeps[i]);
        if (hasChanged) {
            hookCallbackDeps[idx] = deps || [];
            hookCallbackCells[idx] = fn;
        }
        return hookCallbackCells[idx];
    },
    useMemo: (fn: () => unknown, deps?: unknown[]) => {
        const idx = hookCursor++;
        const prevDeps = hookMemoDeps[idx];
        const hasChanged = !prevDeps || !deps || deps.some((d, i) => d !== prevDeps[i]);
        if (hasChanged) {
            hookMemoDeps[idx] = deps || [];
            hookMemoCells[idx] = fn();
        }
        return hookMemoCells[idx];
    },
    useLayoutEffect: (fn: () => void) => fn(),
    useContext: (ctx: { _currentValue: unknown }) => ctx._currentValue,
}));

// Mock useKeyboard
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

// Capture props for testing
let lastStepProps: Record<string, any> | null = null;
mock.module("../components/wizard/WizardStepRenderer", () => ({
    WizardStepRenderer: (props: { stepProps: Record<string, any> }) => {
        lastStepProps = props.stepProps;
        return React.createElement("box", { name: "mock-renderer" });
    }
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
        refs: { urlRef: { current: "" }, userRef: { current: "" }, passRef: { current: "" } }
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
        hookCursor = 0;
        hookStateCells = [];
        hookRefCells = [];
        hookEffectDeps = [];
        hookCallbackDeps = [];
        hookMemoDeps = [];
        hookCallbackCells = [];
        hookMemoCells = [];
        capturedHandler = () => { };
        lastStepProps = null;
    });

    const renderWizard = (props: Partial<React.ComponentProps<typeof WizardContainer>> = {}) => {
        hookCursor = 0;
        const result = render(
            React.createElement(WizardContainer, {
                initialConfig: EMPTY_CONFIG,
                mode: "restart",
                onComplete: mockOnComplete,
                onCancel: mockOnCancel,
                onQuit: () => { },
                onUpdate: mockOnUpdate,
                focusArea: "body",
                onFocusChange: () => { },
                backSignal: 0,
                ...props
            } as any)
        );

        // MANUALLY EXECUTE NESTED COMPONENTS SINCE MOCKRENDER IS SHALLOW
        const renderer = result.findWithProp("step");
        if (renderer && typeof renderer.type === 'function') {
            renderer.type(renderer.props);
        }

        return result;
    };

    const runAction = (name: string, props: Partial<React.ComponentProps<typeof WizardContainer>> = {}) => {
        capturedHandler({ name });
        renderWizard(props);
    };

    it("should select source provider and trigger onUpdate when return is pressed", () => {
        renderWizard();
        runAction("return"); // Shortcut -> download_mode
        runAction("return"); // Mode -> source_choice

        // Find gdrive index in options
        const options = lastStepProps!.getOptions();
        const gdriveIdx = options.findIndex((o: any) => o.value === "gdrive");
        for (let i = 0; i < gdriveIdx; i++) runAction("down");

        runAction("return"); // Select gdrive
        expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ source_provider: 'gdrive' }));
    });

    it("should handle backSignal by calling onCancel when at initial step", () => {
        renderWizard({ backSignal: 0 });
        renderWizard({ backSignal: 1 });
        expect(mockOnCancel).toHaveBeenCalled();
    });

    it("should navigate through the wizard using props", () => {
        renderWizard();

        // 1. Shortcut -> Mode
        lastStepProps!.confirmSelection(lastStepProps!.getOptions()[0]);
        renderWizard();
        expect(lastStepProps!.step).toBe("download_mode");

        // 2. Mode -> Source
        lastStepProps!.confirmSelection(lastStepProps!.getOptions()[0]);
        renderWizard();
        expect(lastStepProps!.step).toBe("source_choice");

        // 3. Select GDrive -> Intro
        const gdriveOpt = lastStepProps!.getOptions().find((o: any) => o.value === "gdrive");
        lastStepProps!.confirmSelection(gdriveOpt);
        renderWizard();
        expect(lastStepProps!.step).toBe("gdrive_intro");

        // 4. Intro -> Cloud Direct Entry
        lastStepProps!.next();
        renderWizard();
        expect(lastStepProps!.step).toBe("cloud_direct_entry");

        // 5. Test direct auth dispatch from direct entry
        lastStepProps!.dispatchDirectAuth("gdrive");
        renderWizard();
        expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ source_provider: 'gdrive' }));
        expect(lastStepProps!.step).toBe("dir");
    });
});
