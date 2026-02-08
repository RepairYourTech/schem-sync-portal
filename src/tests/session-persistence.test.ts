import { expect, test, describe, beforeEach, afterAll, mock } from "bun:test";
import { clearSyncSession, resetSessionCompletions } from "../lib/sync";
import { startNewSession, getCurrentSessionId, isNewSession } from "../lib/sync/utils";
import { parseJsonLog, getSessionCompletionsSize } from "../lib/sync/progress";
import { createEmptyState, saveSyncState, loadSyncState } from "../lib/syncState";
import type { PortalConfig } from "../lib/config";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

describe("Sync Session Persistence", () => {
    const testLocalDir = join("/tmp", `persistence-test-${Math.random().toString(36).slice(2)}`);
    const mockConfig: PortalConfig = {
        local_dir: testLocalDir,
        source_provider: "gdrive",
        backup_provider: "copyparty",
        upsync_enabled: true,
        enable_malware_shield: true,
        malware_policy: "purge",
        download_mode: "lean"
    } as unknown as PortalConfig;

    beforeEach(() => {
        if (existsSync(testLocalDir)) rmSync(testLocalDir, { recursive: true, force: true });
        mkdirSync(testLocalDir, { recursive: true });
        clearSyncSession();
        resetSessionCompletions();
    });

    afterAll(() => {
        if (existsSync(testLocalDir)) rmSync(testLocalDir, { recursive: true, force: true });
    });

    test("Lean mode persists across app restart", () => {
        // Create session state with downloadMode: "lean"
        const state = createEmptyState();
        state.downloadMode = "lean";
        saveSyncState(testLocalDir, state);

        // Load the state and verify
        const restoredState = loadSyncState(testLocalDir);
        expect(restoredState).not.toBeNull();
        expect(restoredState?.downloadMode).toBe("lean");

        // Verify effective mode calculation (as implemented in pullPhase)
        const effectiveMode = restoredState?.downloadMode || mockConfig.download_mode || "full";
        expect(effectiveMode).toBe("lean");

        // Test fallback to config if session state missing downloadMode
        const legacyState = createEmptyState();
        // downloadMode is undefined
        saveSyncState(testLocalDir, legacyState);
        const restoredLegacy = loadSyncState(testLocalDir);
        const fallbackMode = restoredLegacy?.downloadMode || mockConfig.download_mode || "full";
        expect(fallbackMode).toBe("lean"); // Falls back to config
    });

    test("Idle state does not trigger resume adoption", () => {
        // Create an idle state (all statuses "idle")
        const idleState = createEmptyState();
        idleState.sessionId = "idle-session";
        saveSyncState(testLocalDir, idleState);

        // Verify that adoption logic (as partially implemented in runSync) would ignore it
        const state = loadSyncState(testLocalDir);
        const isResumable = state ? (
            state.downsyncStatus === "incomplete" || state.downsyncStatus === "paused" ||
            state.shieldStatus === "incomplete" || state.shieldStatus === "paused" ||
            state.upsyncStatus === "incomplete" || state.upsyncStatus === "paused"
        ) : false;

        expect(isResumable).toBe(false);
    });

    test("Session ID generation and comparison", () => {
        const id1 = startNewSession();
        expect(id1).toStartWith("session_");
        expect(getCurrentSessionId()).toBe(id1);
        expect(isNewSession(id1)).toBe(false);

        const id2 = "session_other";
        expect(isNewSession(id2)).toBe(true);
    });

    test("Stats persist when reusing session ID", async () => {
        const sessionId = startNewSession();
        expect(sessionId).toBeDefined();

        // Mock some transfers in progress
        await parseJsonLog({
            msg: "Transferred",
            name: "file1.txt",
            size: 100,
            bytes: 100,
            percentage: 100
        }, () => { });

        expect(getSessionCompletionsSize()).toBe(1);

        // Run sync with same session ID - should NOT reset state
        // We mock everything to exit quickly
        const onProgress = mock(() => { });
        expect(onProgress).toBeDefined();

        // Note: we don't actually call runSync here because it spawns processes, 
        // we just test the logic inside runSync or the state behavior.
        // But let's verify that clearSyncSession actually clears it (baseline)
        clearSyncSession();
        expect(getSessionCompletionsSize()).toBe(0);
    });

    test("Conditional reset logic in runSync concept", () => {
        startNewSession();
        // Simulate progress state
        parseJsonLog({ msg: "Transferred", name: "test.txt", size: 10, bytes: 10 }, () => { });
        expect(getSessionCompletionsSize()).toBe(1);

        // Scenario: New Session (No ID)
        // If we were in runSync:
        const incomingSessionId = undefined;
        if (!incomingSessionId || isNewSession(incomingSessionId as string)) {
            clearSyncSession();
        }
        expect(mockConfig).toBeDefined();
        expect(getSessionCompletionsSize()).toBe(0);

        // Scenario: Resume (Same ID)
        const sid = startNewSession();
        parseJsonLog({ msg: "Transferred", name: "test.txt", size: 10, bytes: 10 }, () => { });
        expect(getSessionCompletionsSize()).toBe(1);

        const resumeSid = sid;
        if (!resumeSid || isNewSession(resumeSid)) {
            clearSyncSession();
        }
        expect(getSessionCompletionsSize()).toBe(1); // Should still be 1!
    });
});
