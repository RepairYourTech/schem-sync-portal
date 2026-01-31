import { appendFileSync, existsSync, statSync, renameSync, unlinkSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { Env } from "./env";

export type LogLevel = "NORMAL" | "DEBUG" | "VERBOSE";
export type LogContext = "AUTH" | "SYNC" | "UI" | "DEPLOY" | "CONFIG" | "SYSTEM";

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    context: LogContext;
    message: string;
}

export class Logger {
    private static level: LogLevel = "NORMAL";
    private static sensitivePatterns: RegExp[] = [
        /password/gi,
        /secret/gi,
        /cookie/gi,
        /token/gi,
        /key/gi,
        /client_id/gi,
        /client_secret/gi,
        /access_token/gi,
        /refresh_token/gi
    ];

    private static healthStatus: Record<LogContext, "OK" | "WARN" | "ERROR"> = {
        AUTH: "OK",
        SYNC: "OK",
        UI: "OK",
        DEPLOY: "OK",
        CONFIG: "OK",
        SYSTEM: "OK"
    };

    static setLevel(level: LogLevel) {
        this.level = level;
    }

    static getLevel(): LogLevel {
        return this.level;
    }

    static info(context: LogContext, message: string) {
        this.log("NORMAL", context, message);
    }

    static error(context: LogContext, message: string, error?: unknown) {
        const errorMsg = error instanceof Error ? ` | ${error.message}` : error ? ` | ${String(error)}` : "";
        this.log("NORMAL", context, `ERROR: ${message}${errorMsg}`);
        this.healthStatus[context] = "ERROR";
    }

    static warn(context: LogContext, message: string) {
        this.log("NORMAL", context, `WARNING: ${message}`);
        if (this.healthStatus[context] !== "ERROR") {
            this.healthStatus[context] = "WARN";
        }
    }

    static debug(context: LogContext, message: string) {
        this.log("DEBUG", context, message);
    }

    static verbose(context: LogContext, message: string) {
        this.log("VERBOSE", context, message);
    }

    /**
     * Rotates logs if they exceed a size limit.
     */
    static rotateLogs(filename: string = "system.log", maxBytes: number = 5 * 1024 * 1024) {
        try {
            const logPath = Env.getLogPath(filename);
            if (!existsSync(logPath)) return;

            const stats = statSync(logPath);
            if (stats.size > maxBytes) {
                const oldPath = `${logPath}.old`;
                try { if (existsSync(oldPath)) unlinkSync(oldPath); } catch { }
                renameSync(logPath, oldPath);

                const disclaimer = `[${new Date().toISOString()}] Log rotated. Previous logs in ${filename}.old\n`;
                appendFileSync(logPath, disclaimer);
            }
        } catch (e) {
            console.error("Failed to rotate logs:", e);
        }
    }

    static getRecentLogs(lines: number = 50, filename: string = "system.log"): string[] {
        try {
            const logPath = Env.getLogPath(filename);
            if (!existsSync(logPath)) return ["No logs found."];

            const content = readFileSync(logPath, "utf-8");
            return content.split("\n").filter((l: string) => l.trim() !== "").slice(-lines);
        } catch {
            return ["Failed to read logs."];
        }
    }

    static clearLogs(): void {
        try {
            const logPath = Env.getLogPath("system.log");
            if (existsSync(logPath)) {
                writeFileSync(logPath, "");
            }

            const { logsDir } = Env.getPaths();
            if (!existsSync(logsDir)) return;

            const files = readdirSync(logsDir);
            for (const file of files) {
                if (file === "system.log") continue;
                try { unlinkSync(join(logsDir, file)); } catch { }
            }
        } catch (e) {
            console.error("Failed to clear logs:", e);
        }
    }

    /**
     * Diagnostic API: Returns the current health of the system components.
     */
    static getHealthReport() {
        const overall = Object.values(this.healthStatus).every(s => s === "OK") ? "RESILIENT" :
            Object.values(this.healthStatus).some(s => s === "ERROR") ? "COMPROMISED" : "VULNERABLE";

        return {
            status: overall,
            components: { ...this.healthStatus }
        };
    }

    private static log(level: LogLevel, context: LogContext, message: string) {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            context,
            message: this.maskSensitive(message)
        };

        const formatted = `[${entry.timestamp}] [${entry.level}] [${entry.context}] ${entry.message}\n`;

        // Console output
        if (level === "NORMAL") {
            console.log(formatted.trim());
        } else if (this.level === "DEBUG" || this.level === "VERBOSE") {
            console.debug(formatted.trim());
        }

        // File output
        this.writeToFile(formatted);
    }

    private static shouldLog(level: LogLevel): boolean {
        if (this.level === "VERBOSE") return true;
        if (this.level === "DEBUG") return level === "NORMAL" || level === "DEBUG";
        return level === "NORMAL";
    }

    private static maskSensitive(message: string): string {
        let masked = message;
        this.sensitivePatterns.forEach(pattern => {
            // Case 1: key="value" or key='value' or key: "value"
            const quotedRegex = new RegExp(`(${pattern.source})\\s*[:=]\\s*(["'])([^"']*?)\\2`, "gi");
            masked = masked.replace(quotedRegex, "$1=********");

            // Case 2: key=value (no quotes, up to space or end of string)
            const unquotedRegex = new RegExp(`(${pattern.source})\\s*[:=]\\s*([^\\s,;]+)`, "gi");
            masked = masked.replace(unquotedRegex, "$1=********");
        });
        return masked;
    }

    private static writeToFile(line: string) {
        try {
            const logPath = Env.getLogPath("system.log");
            appendFileSync(logPath, line);
        } catch {
            // Silently fail if we can't write logs to file
        }
    }
}
