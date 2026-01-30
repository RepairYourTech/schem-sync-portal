import { execSync } from "child_process";
import { Logger } from "./logger";

export interface UpdateStatus {
    success: boolean;
    message: string;
}

export async function performUpdate(): Promise<UpdateStatus> {
    Logger.info("SYSTEM", "Checking for system updates...");
    try {
        // 1. Check if git is available
        try {
            execSync("git --version");
        } catch {
            Logger.warn("SYSTEM", "Git not found, skipping update check.");
            return { success: false, message: "Git is not installed on this system." };
        }

        // 2. Check if remote origin exists
        let remoteUrl = "";
        try {
            remoteUrl = execSync("git remote get-url origin").toString().trim();
        } catch {
            Logger.warn("SYSTEM", "No git origin found, cannot update.");
            return {
                success: false,
                message: "No 'origin' remote found. Please link to a repository first."
            };
        }

        // 3. Perform Non-Destructive Update
        // Use git stash to protect any local uncommitted changes
        // Use git pull --rebase to bring in remote changes and replay local commits on top
        // Use git stash pop to restore local uncommitted changes

        try {
            Logger.info("SYSTEM", `Updating from ${remoteUrl}...`);
            execSync("git stash");
            execSync("git fetch origin");
            execSync("git pull --rebase origin main");
            try {
                execSync("git stash pop");
            } catch {
                // If stash pop fails (e.g. nothing to pop), we ignore it
            }

            Logger.info("SYSTEM", "System updated successfully.");
            return { success: true, message: `Updated successfully from ${remoteUrl}` };
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error("SYSTEM", "Update failed", error);
            return { success: false, message: `Update failed: ${error.message}` };
        }
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("SYSTEM", "Unexpected update error", error);
        return { success: false, message: `Unexpected error: ${error.message}` };
    }
}
