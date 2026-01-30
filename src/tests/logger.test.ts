import { expect, test, describe, beforeAll } from "bun:test";
import { Logger } from "../lib/logger";


describe("Logger Service", () => {

    beforeAll(() => {
        Logger.clearLogs();
    });

    test("should mask sensitive information", () => {
        const sensitiveMsg = "User logged in with password: 'SecretPassword123' and token=abc-123-def";
        Logger.info("AUTH", sensitiveMsg);

        const logs = Logger.getRecentLogs(1);
        const lastLog = logs[logs.length - 1];

        expect(lastLog).toContain("password=********");
        expect(lastLog).toContain("token=********");
        expect(lastLog).not.toContain("SecretPassword123");
        expect(lastLog).not.toContain("abc-123-def");
    });

    test("should respect log levels", () => {
        Logger.setLevel("NORMAL");
        Logger.debug("SYSTEM", "This should not be logged");

        let logs = Logger.getRecentLogs(1);
        expect(logs[logs.length - 1]).not.toContain("[DEBUG]");

        Logger.setLevel("DEBUG");
        Logger.debug("SYSTEM", "This should be logged");
        logs = Logger.getRecentLogs(1);
        expect(logs[logs.length - 1]).toContain("[DEBUG]");
    });

    test("should report health status correctly", () => {
        Logger.info("SYNC", "Syncing normally");
        let report = Logger.getHealthReport();
        expect(report.components.SYNC).toBe("OK");

        Logger.error("AUTH", "Login failure");
        report = Logger.getHealthReport();
        expect(report.components.AUTH).toBe("ERROR");
        expect(report.status).toBe("COMPROMISED");
    });
});
