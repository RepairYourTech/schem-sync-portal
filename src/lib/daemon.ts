import { join } from "path";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { Env } from "./env";
import { Logger } from "./logger";

export type DaemonStatus = "running" | "stopped" | "not_installed";

const SERVICE_NAME = "schem-sync-ntfy";

function getServicePaths() {
    const paths = Env.getPaths();

    if (Env.isWin) {
        const startupDir = join(
            process.env.APPDATA || "",
            "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
        );
        return {
            serviceFile: join(startupDir, `${SERVICE_NAME}.bat`),
            pidFile: join(paths.configDir, `${SERVICE_NAME}.pid`)
        };
    } else if (Env.isMac) {
        return {
            serviceFile: join(paths.home, "Library", "LaunchAgents", `com.portal.${SERVICE_NAME}.plist`),
            pidFile: join(paths.configDir, `${SERVICE_NAME}.pid`)
        };
    } else {
        const systemdDir = join(paths.home, ".config", "systemd", "user");
        return {
            serviceFile: join(systemdDir, `${SERVICE_NAME}.service`),
            pidFile: join(paths.configDir, `${SERVICE_NAME}.pid`)
        };
    }
}

function getWorkerCommand(): string {
    const bunPath = process.execPath || "bun";
    const workerPath = join(process.cwd(), "src", "lib", "ntfy-worker.ts");
    return `${bunPath} run ${workerPath}`;
}

function generateLinuxService(): string {
    const cmd = getWorkerCommand();
    return `[Unit]
Description=Schematic Portal ntfy Listener
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${cmd}
Restart=on-failure
RestartSec=10
WorkingDirectory=${process.cwd()}

[Install]
WantedBy=default.target
`;
}

function generateMacPlist(): string {
    const parts = getWorkerCommand().split(" ");
    const programArgs = parts.map(p => `        <string>${p}</string>`).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.portal.${SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
${programArgs}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${process.cwd()}</string>
    <key>StandardOutPath</key>
    <string>${Env.getLogPath("daemon.log")}</string>
    <key>StandardErrorPath</key>
    <string>${Env.getLogPath("daemon-error.log")}</string>
</dict>
</plist>
`;
}

function generateWindowsBat(): string {
    const cmd = getWorkerCommand();
    return `@echo off\r\nstart /B "" ${cmd}\r\n`;
}

/**
 * Install the ntfy daemon as a platform-native background service.
 */
export async function installDaemon(): Promise<void> {
    const { serviceFile } = getServicePaths();
    const dir = join(serviceFile, "..");

    try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        if (Env.isWin) {
            writeFileSync(serviceFile, generateWindowsBat(), "utf-8");
            Logger.info("DAEMON", `Installed startup script: ${serviceFile}`);
        } else if (Env.isMac) {
            writeFileSync(serviceFile, generateMacPlist(), "utf-8");
            const result = Bun.spawnSync(["launchctl", "load", serviceFile], { stdout: "pipe", stderr: "pipe" });
            if (!result.success) Logger.warn("DAEMON", `launchctl load warning: ${result.stderr?.toString()}`);
            Logger.info("DAEMON", `Installed and loaded launchd plist: ${serviceFile}`);
        } else {
            writeFileSync(serviceFile, generateLinuxService(), "utf-8");
            Bun.spawnSync(["systemctl", "--user", "daemon-reload"], { stdout: "pipe", stderr: "pipe" });
            Bun.spawnSync(["systemctl", "--user", "enable", SERVICE_NAME], { stdout: "pipe", stderr: "pipe" });
            Bun.spawnSync(["systemctl", "--user", "start", SERVICE_NAME], { stdout: "pipe", stderr: "pipe" });
            Logger.info("DAEMON", `Installed and started systemd user service: ${serviceFile}`);
        }
    } catch (err) {
        Logger.error("DAEMON", "Failed to install daemon", err);
        throw err;
    }
}

/**
 * Uninstall and stop the ntfy daemon.
 */
export async function uninstallDaemon(): Promise<void> {
    const { serviceFile } = getServicePaths();

    try {
        if (Env.isMac) {
            Bun.spawnSync(["launchctl", "unload", serviceFile], { stdout: "pipe", stderr: "pipe" });
        } else if (!Env.isWin) {
            Bun.spawnSync(["systemctl", "--user", "stop", SERVICE_NAME], { stdout: "pipe", stderr: "pipe" });
            Bun.spawnSync(["systemctl", "--user", "disable", SERVICE_NAME], { stdout: "pipe", stderr: "pipe" });
        }

        if (existsSync(serviceFile)) {
            unlinkSync(serviceFile);
            Logger.info("DAEMON", `Removed service file: ${serviceFile}`);
        }

        if (!Env.isWin) {
            Bun.spawnSync(["systemctl", "--user", "daemon-reload"], { stdout: "pipe", stderr: "pipe" });
        }
    } catch (err) {
        Logger.error("DAEMON", "Failed to uninstall daemon", err);
    }
}

/**
 * Check if the daemon service file is installed.
 */
export function isDaemonInstalled(): boolean {
    const { serviceFile } = getServicePaths();
    return existsSync(serviceFile);
}

/**
 * Get the current daemon status.
 */
export function getDaemonStatus(): DaemonStatus {
    const { serviceFile } = getServicePaths();

    if (!existsSync(serviceFile)) return "not_installed";

    if (Env.isWin) {
        return "stopped";
    } else if (Env.isMac) {
        const result = Bun.spawnSync(
            ["launchctl", "list", `com.portal.${SERVICE_NAME}`],
            { stdout: "pipe", stderr: "pipe" }
        );
        return result.success ? "running" : "stopped";
    } else {
        const result = Bun.spawnSync(
            ["systemctl", "--user", "is-active", SERVICE_NAME],
            { stdout: "pipe", stderr: "pipe" }
        );
        const output = result.stdout?.toString().trim();
        return output === "active" ? "running" : "stopped";
    }
}
