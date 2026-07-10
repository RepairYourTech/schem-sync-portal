import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import * as opentuiReact from "@opentui/react";
import { Wizard } from "../../components/Wizard";
import { mockRender as render, mockThemeColors } from "../ui-test-helpers";
import { EMPTY_CONFIG, type PortalConfig, type PortalProvider } from "../../lib/config";
import { join } from "path";
import { tmpdir } from "os";

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

    // The path step now validates before advancing, so the flow needs a real, safe
    // directory. Previously Enter on the input skipped validation entirely.
    const testLocalDir = join(tmpdir(), "portal_wizard_e2e");

    const renderWizard = () => {
        hookStateIndex = 0;
        hookRefIndex = 0;
        hookEffectIndex = 0;
        return render(
            React.createElement(Wizard, {
                initialConfig: { ...EMPTY_CONFIG, local_dir: testLocalDir },
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

    it("walks the full first-run flow to deploy and saves the config", async () => {
        renderWizard();

        // shortcut: [YES, NO, back] -> YES
        runAction("return");

        // download_mode: [full, lean, back] -> full
        runAction("return");

        // source_choice: index 1 is gdrive
        runAction("down");
        runAction("return");

        // gdrive_intro: [guided, direct, back] -> direct
        runAction("down");
        runAction("return");

        // cloud_direct_entry (source): clientId -> clientSecret -> CONNECT.
        // Blank Google credentials are allowed: rclone falls back to its shared client.
        runAction("return");
        runAction("return");
        runAction("return");

        // dir: Enter on the input moves focus to CONFIRM; Enter there validates the path.
        runAction("return");
        runAction("return");

        // mirror: [additive, strict, back] -> additive
        runAction("return");

        // upsync_ask: [download_only, sync_backup, back] -> sync_backup
        runAction("down");
        runAction("return");

        // dest_cloud_select: index 0 is gdrive
        runAction("return");

        // gdrive_intro (dest) -> direct
        runAction("down");
        runAction("return");

        // cloud_direct_entry (dest): focus resets to the first field on re-entry
        runAction("return");
        runAction("return");
        runAction("return");

        // backup_dir: input -> CONFIRM. An empty backup dir is permitted.
        runAction("return");
        runAction("return");

        // security: gdrive backup hides EXTRACT/DISABLED -> isolate
        runAction("return");

        // ntfy_config: URL -> TEST (no URL, so it advances) -> DAEMON -> CONTINUE -> fire
        runAction("return");
        runAction("return");
        runAction("return");
        runAction("return");

        // deploy: [SAVE, DISCARD, back] -> SAVE
        runAction("return");

        // Small wait for async onComplete/saveConfig
        await new Promise(r => setTimeout(r, 10));

        expect(mockSaveConfig).toHaveBeenCalled();
        expect(mockOnComplete).toHaveBeenCalled();

        // The mocked useWizardAuth rewrites local_dir, so assert on the flow's own outputs.
        const saved = mockSaveConfig.mock.calls[0]?.[0] as PortalConfig;
        expect(saved.source_provider).toBe("gdrive");
        expect(saved.backup_provider).toBe("gdrive");
        expect(saved.upsync_enabled).toBe(true);
        // Reaching Security proves the download/backup branch no longer skips it.
        expect(saved.malware_policy).toBe("isolate");
    });
});
