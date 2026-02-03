import { spawnSync } from "child_process";
import { Logger } from "./logger";
import pkg from "../../package.json";

export interface UpdateStatus {
    success: boolean;
    message: string;
}

export async function performUpdate(): Promise<UpdateStatus> {
    Logger.info("SYSTEM", `Checking for system updates (Current: v${pkg.version})...`);
    try {
        // 1. Check if git is available
        const gitVersion = spawnSync("git", ["--version"]);
        if (gitVersion.status !== 0) {
            Logger.warn("SYSTEM", "Git not found, skipping update check.");
            return { success: false, message: "Git is not installed on this system." };
        }

        // 2. Check if remote origin exists and validate URL
        const remoteResult = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" });
        if (remoteResult.status !== 0) {
            Logger.warn("SYSTEM", "No git origin found, cannot update.");
            return {
                success: false,
                message: "No 'origin' remote found. Please link to a repository first."
            };
        }

        const remoteUrl = remoteResult.stdout.trim();
        // Basic injection guard: ensure it looks like a git URL
        if (!/^(https?:\/\/|git@|ssh:\/\/).*/.test(remoteUrl)) {
            Logger.error("SYSTEM", `Invalid or suspicious git remote: ${remoteUrl}`);
            return { success: false, message: "Invalid git remote URL." };
        }

        // 3. Perform Non-Destructive Update
        Logger.info("SYSTEM", `Updating from ${remoteUrl}...`);

        // Stash local changes
        spawnSync("git", ["stash"]);

        // Fetch
        const fetchResult = spawnSync("git", ["fetch", "origin"]);
        if (fetchResult.status !== 0) {
            return { success: false, message: "Failed to fetch updates from remote." };
        }

        // Pull
        const pullResult = spawnSync("git", ["pull", "--rebase", "origin", "main"]);

        // Always try to pop stash if we stashed
        spawnSync("git", ["stash", "pop"]);

        if (pullResult.status !== 0) {
            Logger.error("SYSTEM", "Pull failed", pullResult.stderr?.toString());
            return { success: false, message: "Failed to pull updates. You may have local merge conflicts." };
        }

        Logger.info("SYSTEM", "System updated successfully.");
        return { success: true, message: `Updated successfully from ${remoteUrl}` };

    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("SYSTEM", "Unexpected update error", error);
        return { success: false, message: `Unexpected error: ${error.message}` };
    }
}
