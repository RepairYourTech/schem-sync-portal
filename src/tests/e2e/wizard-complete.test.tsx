import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import * as opentuiReact from "@opentui/react";
import { Wizard } from "../../components/Wizard";
import { mockRender as render, mockThemeColors } from "../ui-test-helpers";
import { EMPTY_CONFIG, type PortalConfig, type PortalProvider } from "../../lib/config";

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
    useKeyboard: (handler: (e: { name: string }) => void) => { capturedHandler = handler; }
}));

// Mock useTheme
mock.module("../../lib/theme", () => ({
    useTheme: () => ({ colors: mockThemeColors })
}));

const mockSaveConfig = mock((config: PortalConfig) => Promise.resolve(config));
mock.module("../../lib/config", () => ({
    EMPTY_CONFIG,
    saveConfig: mockSaveConfig
}));

mock.module("../../lib/deploy", () => ({
    isSystemBootstrapped: () => false,
    bootstrapSystem: mock(() => Promise.resolve())
}));

mock.module("../../hooks/useWizardAuth", () => ({
    useWizardAuth: (props: {
        wizardContext: "source" | "dest";
        updateConfig: (fn: (prev: PortalConfig) => PortalConfig) => void;
        next: () => void;
    }) => ({
        handleAuth: mock(() => { }),
        handleGdriveAuth: mock(() => { }),
        startGenericAuth: mock(() => { }),
        dispatchDirectAuth: (provider: unknown) => {
            props.updateConfig((prev: PortalConfig) => ({
                ...prev,
                [props.wizardContext === "source" ? "source_provider" : "backup_provider"]: provider as PortalProvider,
                local_dir: "/home/user/sync",
                upsync_enabled: true,
                enable_malware_shield: true
            }));
            props.next();
        },
        refs: {
            urlRef: { current: "" },
            userRef: { current: "test-user" },
            passRef: { current: "test-pass" },
            clientIdRef: { current: "test-client-id" },
            clientSecretRef: { current: "test-client-secret" },
            b2IdRef: { current: "test-b2-id" },
            b2KeyRef: { current: "test-b2-key" }
        }
    })
}));

describe("E2E: Wizard Completion", () => {
    let mockOnComplete: (config: PortalConfig) => void;

    beforeEach(() => {
        mockOnComplete = mock((_config: PortalConfig) => { });
        mockSaveConfig.mockClear();
        hookStateIndex = 0;
        hookStateCells = [];
        hookRefIndex = 0;
        hookRefCells = [];
        hookEffectIndex = 0;
        hookEffectDeps = [];
    });

    const renderWizard = () => {
        hookStateIndex = 0;
        hookRefIndex = 0;
        hookEffectIndex = 0;
        return render(
            React.createElement(Wizard, {
                initialConfig: EMPTY_CONFIG,
                mode: "restart",
                onComplete: async (cfg: PortalConfig) => {
                    await mockSaveConfig(cfg);
                    mockOnComplete(cfg);
                },
                onCancel: () => { },
                onQuit: () => { },
                onUpdate: () => { },
                focusArea: "body",
                onFocusChange: () => { },
                backSignal: 0,
                tabTransition: "forward"
            })
        );
    };

    const runAction = (name: string) => {
        capturedHandler({ name });
        renderWizard();
    };

    it("should simulate a full gdrive-to-b2 flow and save config", async () => {
        renderWizard();

        // 0. Skip shortcut
        runAction("return");

        // 1. Source Choice -> GDrive
        runAction("down");
        runAction("return");

        // 2. GDrive Intro -> Direct
        runAction("down");
        runAction("return");

        // 3. GDrive auth (3 returns)
        runAction("return");
        runAction("return");
        runAction("return");

        // 4. Dir confirmed (input -> button -> confirm)
        runAction("return");
        runAction("return");
        // 5. Mirror confirmed
        runAction("return");
        // 6. Upsync -> Yes
        runAction("down");
        runAction("return");

        // 7. Dest Selection -> B2
        runAction("down");
        runAction("return");

        // 8. B2 Intro -> Direct
        runAction("down");
        runAction("return");

        // 9. B2 auth (3 returns)
        runAction("return");
        runAction("return");
        runAction("return");


        // 10. Backup Dir confirmed (input -> button -> confirm)
        runAction("return");
        runAction("return");
        // 11. Security confirmed
        runAction("return");
        // 12. Deploy confirmed
        runAction("return");

        // Small wait for async onComplete/saveConfig
        await new Promise(r => setTimeout(r, 10));

        expect(mockSaveConfig).toHaveBeenCalled();
        expect(mockOnComplete).toHaveBeenCalled();
    });
});
