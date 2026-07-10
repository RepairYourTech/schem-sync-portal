import { describe, it, expect, mock, beforeEach } from "bun:test";
import { handleSyncKeys } from "../components/SyncKeyHandler";

describe("handleSyncKeys Regression Tests", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockState: any;

    beforeEach(() => {
        mockState = {
            config: { source_provider: "gdrive", enable_malware_shield: true, upsync_enabled: true, backup_provider: "s3" },
            isRunning: true,
            focusArea: "body",
            progress: { isPaused: false },
            syncFocusIndex: 0,
            syncSubFocusIndex: 0,
            setSyncFocusIndex: mock(),
            setSyncSubFocusIndex: mock(),
            setConfig: mock(),
            handleStartSync: mock(),
            stop: mock(),
            pause: mock(),
            resume: mock(),
            pausePhase: mock(),
            resumePhase: mock(),
            isPhasePaused: mock(() => false)
        };
    });

    describe("focus ownership", () => {
        // The sync view had no keyboard exit: this handler swallowed Enter and the arrows
        // even when the app footer's Exit button was focused, toggling the sync instead.
        it("declines every key when the footer owns focus", () => {
            mockState.focusArea = "footer";
            for (const name of ["return", "up", "down", "left", "right", "h", "l", "p", "r", "4", "6", "8"]) {
                expect(handleSyncKeys({ name }, mockState)).toBe(false);
            }
            expect(mockState.stop).not.toHaveBeenCalled();
            expect(mockState.handleStartSync).not.toHaveBeenCalled();
        });

        it("declines keys when the header owns focus", () => {
            mockState.focusArea = "header";
            expect(handleSyncKeys({ name: "return" }, mockState)).toBe(false);
        });

        it("still handles keys when the body owns focus", () => {
            mockState.focusArea = "body";
            expect(handleSyncKeys({ name: "return" }, mockState)).toBe(true);
            expect(mockState.stop).toHaveBeenCalled();
        });
    });

    it("should focus Pause/Resume when 'p' is pressed but NOT call pausePhase", () => {
        mockState.syncFocusIndex = 1;
        const handled = handleSyncKeys({ name: "p" }, mockState);

        expect(handled).toBe(true);
        expect(mockState.setSyncSubFocusIndex).toHaveBeenCalledWith(0);
        expect(mockState.pausePhase).not.toHaveBeenCalled();
    });

    it("should focus Pause/Resume when 'r' is pressed but NOT call resumePhase", () => {
        mockState.syncFocusIndex = 1;
        const handled = handleSyncKeys({ name: "r" }, mockState);

        expect(handled).toBe(true);
        expect(mockState.setSyncSubFocusIndex).toHaveBeenCalledWith(0);
        expect(mockState.resumePhase).not.toHaveBeenCalled();
    });

    it("should focus rate buttons when '4', '6', '8' are pressed but NOT call setConfig", () => {
        mockState.syncFocusIndex = 1;
        handleSyncKeys({ name: "4" }, mockState);
        expect(mockState.setSyncSubFocusIndex).toHaveBeenCalledWith(1);
        handleSyncKeys({ name: "6" }, mockState);
        expect(mockState.setSyncSubFocusIndex).toHaveBeenCalledWith(2);
        handleSyncKeys({ name: "8" }, mockState);
        expect(mockState.setSyncSubFocusIndex).toHaveBeenCalledWith(3);
        expect(mockState.setConfig).not.toHaveBeenCalled();
    });

    it("should call pausePhase('pull') when Enter is pressed on Source panel (sub-focus 0)", () => {
        mockState.syncFocusIndex = 1;
        mockState.syncSubFocusIndex = 0;
        mockState.isPhasePaused.mockReturnValue(false);
        handleSyncKeys({ name: "return" }, mockState);
        expect(mockState.pausePhase).toHaveBeenCalledWith("pull");
    });

    it("should call resumePhase('pull') when Enter is pressed on Source panel (sub-focus 0) and is paused", () => {
        mockState.syncFocusIndex = 1;
        mockState.syncSubFocusIndex = 0;
        mockState.isPhasePaused.mockReturnValue(true);
        handleSyncKeys({ name: "return" }, mockState);
        expect(mockState.resumePhase).toHaveBeenCalledWith("pull");
    });

    it("should call setConfig when Enter is pressed on rate button (sub-focus 1) on Source panel", () => {
        mockState.syncFocusIndex = 1;
        mockState.syncSubFocusIndex = 1;
        handleSyncKeys({ name: "return" }, mockState);
        expect(mockState.setConfig).toHaveBeenCalled();
        const callArgs = mockState.setConfig.mock.calls[0][0];
        expect(callArgs.downsync_transfers).toBe(4);
    });
});
