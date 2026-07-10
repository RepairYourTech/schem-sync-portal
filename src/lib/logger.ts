import { appendFileSync, existsSync, statSync, renameSync, unlinkSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { Env } from "./env";

export type LogLevel = "NORMAL" | "DEBUG" | "VERBOSE";
export type LogContext = "AUTH" | "SYNC" | "UI" | "DEPLOY" | "CONFIG" | "SYSTEM" | "SHIELD" | "NTFY" | "DAEMON";

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    context: LogContext;
    message: string;
}

export class Logger {
    private static level: LogLevel = "NORMAL";
    private static enableConsole: boolean = false;
    private static sensitivePatterns: RegExp[] = [
        /password/gi,
        /secret/gi,
        /cookie/gi,
        /token/gi,
        /key/gi,
        /client_id/gi,
        /client_secret/gi,
        /access_token/gi,
        /refresh_token/gi,
        /authorization/gi,
        /bearer/gi,
        /api_key/gi,
        /private_key/gi,
        /session/gi,
        /csrf/gi,
        /jwt/gi
    ];

    /**
     * Secrets whose key name does not appear next to them in the log line.
     * Each pattern must capture the non-secret prefix as group 1.
     */
    private static sensitiveValuePatterns: RegExp[] = [
        /(cppws=)[^;"'\s,\]]+/gi,
        /(cppwd=)[^;"'\s,\]]+/gi,
        /(Bearer\s+)[\w.\-~+/]+=*/gi,
        // rclone passes credentials as `argname value` pairs. Only unambiguous
        // multi-word names belong here: bare `pass`/`key` collide with log prose
        // ("Shield pass finished"), and the key=value rule already covers those.
        /(\b(?:secret_access_key|access_key_id|client_secret|client_id|refresh_token|access_token|api_key|private_key)\s+)[^\s,;\]]+/gi
    ];

    private static healthStatus: Record<LogContext, "OK" | "WARN" | "ERROR"> = {
        AUTH: "OK",
        SYNC: "OK",
        UI: "OK",
        DEPLOY: "OK",
        CONFIG: "OK",
        SYSTEM: "OK",
        SHIELD: "OK",
        NTFY: "OK",
        DAEMON: "OK"
    };

    static setLevel(level: LogLevel) {
        this.level = level;
    }

    static getLevel(): LogLevel {
        return this.level;
    }

    static setConsoleEnabled(enabled: boolean) {
        this.enableConsole = enabled;
    }

    static isConsoleEnabled(): boolean {
        return this.enableConsole;
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

    static debug(context: LogContext, message: string, error?: unknown) {
        const errorMsg = error instanceof Error ? ` | ${error.message}` : error ? ` | ${String(error)}` : "";
        this.log("DEBUG", context, `${message}${errorMsg}`);
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
                try { if (existsSync(oldPath)) unlinkSync(oldPath); } catch (err) { this.debug("SYSTEM", "Log rotation cleanup failed:", err); }
                renameSync(logPath, oldPath);

                const disclaimer = `[${new Date().toISOString()}] Log rotated. Previous logs in ${filename}.old\n`;
                appendFileSync(logPath, disclaimer);
            }
        } catch (e) {
            this.error("SYSTEM", "Failed to rotate logs:", e);
        }
    }

    static getRecentLogs(lines: number = 50, filename: string = "system.log"): string[] {
        try {
            const logPath = Env.getLogPath(filename);
            if (!existsSync(logPath)) return ["No logs found."];

            const content = readFileSync(logPath, "utf-8");
            return content.split("\n").filter((l: string) => l.trim() !== "").slice(-lines);
        } catch (err) {
            this.debug("SYSTEM", "Failed to read logs:", err);
            return ["Failed to read logs."];
        }
    }

    static getAllLogsContent(filename: string = "system.log"): string {
        try {
            const logPath = Env.getLogPath(filename);
            if (!existsSync(logPath)) return "";
            return readFileSync(logPath, "utf-8");
        } catch (err) {
            this.debug("SYSTEM", "Failed to read log content:", err);
            return "";
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
                try { unlinkSync(join(logsDir, file)); } catch (err) { this.debug("SYSTEM", `Failed to delete log file: ${file}`, err); }
            }
        } catch (e) {
            this.error("SYSTEM", "Failed to clear logs:", e);
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

        // Console output - Only if enabled AND not in production environment for defense-in-depth
        if (this.enableConsole && process.env.NODE_ENV !== "production") {
            if (level === "NORMAL") {
                console.log(formatted.trim());
            } else if (this.level === "DEBUG" || this.level === "VERBOSE") {
                console.debug(formatted.trim());
            }
        }

        // File output
        this.writeToFile(formatted);
    }

    private static shouldLog(level: LogLevel): boolean {
        if (this.level === "VERBOSE") return true;
        if (this.level === "DEBUG") return level === "NORMAL" || level === "DEBUG";
        return level === "NORMAL";
    }

    /**
     * Masks sensitive segments within a message using predefined patterns.
     * This method is called automatically before any log output (console or file).
     * @param message - The raw log message to be processed.
     * @returns The message with sensitive information replaced by asterisks.
     */
    private static maskSensitive(message: string): string {
        let masked = message;

        // Pass 1: values that are secrets regardless of the key naming them.
        this.sensitiveValuePatterns.forEach(pattern => {
            masked = masked.replace(new RegExp(pattern.source, pattern.flags), "$1********");
        });

        // Pass 2: key/value pairs. The optional quote after the key name is what
        // makes this match JSON (`"access_token": "ya29..."`) and not just `key=value`.
        this.sensitivePatterns.forEach(pattern => {
            const key = pattern.source;

            const quotedRegex = new RegExp(`(${key})["']?\\s*[:=]\\s*(["'])(?:\\\\.|[^"'\\\\])*\\2`, "gi");
            masked = masked.replace(quotedRegex, "$1=********");

            const unquotedRegex = new RegExp(`(${key})["']?\\s*[:=]\\s*([^\\s,;}\\]]+)`, "gi");
            masked = masked.replace(unquotedRegex, "$1=********");
        });
        return masked;
    }

    private static writeToFile(line: string) {
        try {
            const logPath = Env.getLogPath("system.log");
            appendFileSync(logPath, line);
        } catch (err) {
            // Silently fail if we can't write logs to file
            if (this.enableConsole) {
                console.debug("Failed to write to log file:", this.maskSensitive(String(err)));
            }
        }
    }
}
