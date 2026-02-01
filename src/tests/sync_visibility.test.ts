import { expect, test, describe } from "bun:test";
import { parseJsonLog, type SyncProgress, type FileTransferItem, resetSessionState } from "../lib/sync";

describe("Sync Visibility: Structured Data Requirements", () => {

    test("should parse detailed transfer stats from JSON", () => {
        resetSessionState();
        let captured: FileTransferItem | null = null;
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.downloadQueue && p.downloadQueue[0]) captured = p.downloadQueue[0];
        };

        const json = {
            level: "info",
            msg: "Transferred",
            name: "file.zip",
            size: 100 * 1024 * 1024,
            bytes: 50 * 1024 * 1024,
            speed: 2 * 1024 * 1024,
            eta: 25,
            objectType: "file"
        };

        parseJsonLog(json, onUpdate);

        expect(captured).toBeDefined();
        const item = captured as unknown as FileTransferItem;
        expect(item.filename).toBe("file.zip");
        expect(item.percentage).toBe(50);
        expect(item.speed).toContain("MiB/s");
    });

    test("should handle stats block with transferring array", () => {
        resetSessionState();
        let queue: FileTransferItem[] = [];
        let speed = "";
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.downloadQueue) queue = p.downloadQueue;
            if (p.transferSpeed) speed = p.transferSpeed;
        };

        const json = {
            stats: {
                percentage: 45,
                speed: 1234567,
                eta: 60,
                transferring: [
                    { name: "active.bin", size: 1000, bytes: 450, speed: 100, eta: 5 }
                ]
            }
        };

        parseJsonLog(json, onUpdate);

        expect(queue.length).toBeGreaterThan(0);
        expect(queue[0]!.filename).toBe("active.bin");
        expect(queue[0]!.percentage).toBe(45);
        expect(speed).toContain("MiB/s");
    });

    test("should limit completed transfers and prioritize active ones", () => {
        resetSessionState();
        let queue: FileTransferItem[] = [];
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.downloadQueue) queue = p.downloadQueue;
        };

        // 1. Send 5 completed files via JSON
        for (let i = 1; i <= 5; i++) {
            parseJsonLog({
                msg: "Transferred",
                name: `file${i}.zip`,
                size: 100,
                bytes: 100,
                speed: 10,
                objectType: "file"
            }, onUpdate);
        }

        // Should now show 5 completed files (limit is 10)
        expect(queue.filter(t => t.status === "completed").length).toBe(5);

        // 2. Send 1 active file
        parseJsonLog({
            msg: "Transferred",
            name: "active.bin",
            size: 100,
            bytes: 50,
            speed: 10,
            objectType: "file"
        }, onUpdate);

        expect(queue[0]!.filename).toBe("active.bin");
        expect(queue[0]!.status).toBe("active");
        expect(queue.filter(t => t.status === "completed").length).toBe(5);
    });

    test("should report filesTransferred accurately (Issue-018)", () => {
        resetSessionState();

        let lastCount = 0;
        const onUpdate = (p: Partial<SyncProgress>) => {
            if (p.filesTransferred !== undefined) lastCount = p.filesTransferred;
        };

        // 1. Completion via individual file message
        parseJsonLog({
            msg: "Transferred",
            name: "file1.zip",
            size: 100,
            bytes: 100,
            objectType: "file"
        }, onUpdate);
        expect(lastCount).toBe(1);

        // 2. Completion via "Copied" truth message
        parseJsonLog({
            msg: "Copied",
            object: "file2.png",
            level: "info"
        }, onUpdate);
        expect(lastCount).toBe(2);

        // 3. Duplicate should NOT increment
        parseJsonLog({
            msg: "Copied",
            object: "file1.zip",
            level: "info"
        }, onUpdate);
        expect(lastCount).toBe(2);
    });
});
