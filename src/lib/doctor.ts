import { spawnSync } from "bun";
import { Env } from "./env";
import { Logger } from "./logger";

let _spawnSync = spawnSync;

/** @internal - Exported for testing only */
export function __setSpawnSync(mock: typeof spawnSync) {
    _spawnSync = mock;
}

export interface DependencyStatus {
    bun: string | null;
    zig: string | null;
    rclone: string | null;
    archive: string | null;
    diskSpace: string | null;
}

export function checkDependencies(): DependencyStatus {
    const isWin = Env.isWin;

    const getVersion = (cmd: string, args: string[] = ["--version"]) => {
        try {
            const result = _spawnSync([cmd, ...args]);
            if (result.success) {
                const version = result.stdout.toString().split("\n")[0]?.trim() || "Detected";
                Logger.debug("SYSTEM", `Dependency check: ${cmd} -> ${version}`);
                return version;
            }
        } catch (err) {
            Logger.error("SYSTEM", `Failed to check dependency: ${cmd}`, err);
        }
        return null;
    };

    const getDiskSpace = () => {
        try {
            if (isWin) {
                const result = _spawnSync(["powershell", "-Command", "(([WmiSearcher]'Select FreeSpace from Win32_LogicalDisk where DeviceID=\"C:\"').Get() | Select-Object -ExpandProperty FreeSpace) / 1GB"]);
                if (result.success) {
                    const gb = parseFloat(result.stdout.toString().trim());
                    return isNaN(gb) ? "Unknown" : `${gb.toFixed(1)} GB`;
                }
            } else {
                const result = _spawnSync(["df", "-h", "."]);
                if (result.success) {
                    const lines = result.stdout.toString().split("\n");
                    const parts = lines[1]?.split(/\s+/);
                    if (parts?.length && parts[3]) return parts[3];
                }
            }
        } catch (err) {
            Logger.error("SYSTEM", "Failed to check disk space", err);
        }
        return "Unknown";
    };

    const checkArchive = () => {
        const bins = isWin ? ["7z.exe", "7za.exe", "rar.exe"] : ["7z", "7za", "rar", "unrar"];
        // Use Env service if we had a dedicated helper, but findBinary works:
        const binary = Env.findBinary(bins);
        return binary ? "Available" : null;
    };

    return {
        bun: getVersion("bun"),
        zig: getVersion("zig", ["version"]),
        rclone: getVersion("rclone", ["version"]),
        archive: checkArchive(),
        diskSpace: getDiskSpace(),
    };
}
