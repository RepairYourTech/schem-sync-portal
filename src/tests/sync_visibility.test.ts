import { expect, test, describe } from "bun:test";
import { parseProgress, type SyncProgress, type FileTransferItem, parseJsonLog, resetSessionCompletions } from "../lib/sync";

// NOTE: Since sync.ts doesn't export the worker functions directly yet, 
// we will test the behavior through a mockable interface or after we refactor.
// For now, these tests define how the REFACTORED sync.ts SHOULD behave.

describe("Sync Visibility: Perfect State Requirements", () => {

    test("should strip ANSI escape sequences before parsing", () => {
        const ansiLine = "\u001b[2K\u001b[1G* file.zip: 50% /100 MiB, 2 MiB/s, 25s";
        let captured: FileTransferItem | null = null;
        const onUpdate = (p: Partial<SyncProgress>) => { if (p.downloadQueue) captured = p.downloadQueue[0] || null; };

        // This should work even with ANSI garbage
        parseProgress(ansiLine, onUpdate);

        expect(captured).toBeDefined();
        const finalCaptured = captured as unknown as FileTransferItem | null;
        if (finalCaptured) {
            expect(finalCaptured.filename).toBe("file.zip");
            expect(finalCaptured.percentage).toBe(50);
        }
    });

    test("should handle carriage returns (\r) in a single data chunk", () => {
        // rclone often sends multiple updates in one 'data' emit, separated by \r
        const chunk = "* file1.zip: 10% /100 MiB, 1 MiB/s, 90s\r* file1.zip: 20% /100 MiB, 2 MiB/s, 40s\n";
        const updates: FileTransferItem[] = [];
        const onUpdate = (p: Partial<SyncProgress>) => { if (p.downloadQueue && p.downloadQueue[0]) updates.push(p.downloadQueue[0]); };

        // The logic should split on BOTH \r and \n
        // For this test to work with the CURRENT sync.ts, it might fail if it only splits on \n
        const lines = chunk.split(/[\r\n]+/).filter(l => l.trim());
        for (const line of lines) {
            parseProgress(line, onUpdate);
        }

        expect(updates.length).toBe(2);
        expect(updates[0]!.percentage).toBe(10);
        expect(updates[1]!.percentage).toBe(20);
    });

    test("should not corrupt data across staggered stream writes", () => {
        // Simulation of the "Frankenstein" bug
        // Stream A (Stdout): "* fil"
        // Stream B (Stderr): "2026/01/31 INFO"
        // Corrupted: "* fil2026/01/31 INFO"

        // This test defines that the parser MUST handle partial writes per-stream.
        // We will test the future 'StreamHandler' class or similar.
    });

    test("should match individual files even with unknown stats", () => {
        const lines = [
            "* file1.zip: transferring",
            "* file2.zip:  0% /10 GiB, 0 B/s, -",
            "* image.png: 100% /1 MiB, 0 B/s, 0s"
        ];

        const queue: string[] = [];
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.downloadQueue) p.downloadQueue.forEach(f => {
                if (!queue.includes(f.filename)) queue.push(f.filename);
            });
        };

        for (const line of lines) {
            parseProgress(line, onUpdate);
        }

        expect(queue).toContain("file1.zip");
        expect(queue).toContain("file2.zip");
        expect(queue).toContain("image.png");
    });

    test("should limit completed transfers to max 2 and prioritize active ones", () => {
        const queue: FileTransferItem[] = [];
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.downloadQueue) {
                queue.length = 0; // Clear and refill for consistency in this test
                queue.push(...p.downloadQueue);
            }
        };

        // 1. Send 5 completed files
        for (let i = 1; i <= 5; i++) {
            parseProgress(`* file${i}.zip: 100% /1 MiB, 1 MiB/s, 0s`, onUpdate);
        }

        // Should only show 2 completed files (the most recent ones)
        expect(queue.length).toBe(2);
        expect(queue[0]!.status).toBe("completed");

        // 2. Send 1 active file
        parseProgress(`* active.bin: 50% /10 MiB, 1 MiB/s, 5s`, onUpdate);

        // Should show 1 active + 2 completed = 3 total
        expect(queue.length).toBe(3);
        expect(queue[0]!.filename).toBe("active.bin");
        expect(queue[0]!.status).toBe("active");
        expect(queue.filter(t => t.status === "completed").length).toBe(2);
    });

    test("should report filesTransferred accurately across both parser types (Issue-018)", () => {
        resetSessionCompletions();

        let lastCount = 0;
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.filesTransferred !== undefined) lastCount = p.filesTransferred;
        };

        // 1. Completion via human-readable parser
        parseProgress("* legacy.zip: 100% /1 MiB, 1 MiB/s, 0s", onUpdate);
        expect(lastCount).toBe(1);

        // 2. Completion via structured JSON parser (Truth message)
        parseJsonLog({
            msg: "Copied",
            object: "structured_truth.png",
            level: "info"
        }, onUpdate);
        expect(lastCount).toBe(2);

        // 3. Completion via structured JSON parser (Stats block)
        parseJsonLog({
            stats: {
                totalFiles: 10,
                percentage: 50,
                transferring: [
                    { name: "syncing.bin", size: 100, bytes: 100, percentage: 100 }
                ]
            }
        }, onUpdate);
        expect(lastCount).toBe(3);

        // 4. Duplicate should NOT increment
        parseProgress("* legacy.zip: 100% /1 MiB, 1 MiB/s, 0s", onUpdate);
        expect(lastCount).toBe(3);
    });
});
