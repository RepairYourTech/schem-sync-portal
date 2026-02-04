import { spawnSync } from "bun";
import { Logger } from "./logger";
import pkg from "../../package.json";

export interface UpdateStatus {
    success: boolean;
    message: string;
}

// Security: Only allow updates from these trusted remote patterns
const TRUSTED_REMOTES = [
    /^https:\/\/github\.com\/RepairYourTech\/schem-sync-portal(\.git)?$/,
    /^git@github\.com:RepairYourTech\/schem-sync-portal(\.git)?$/
];

/**
 * Hardened Git runner that captures output and returns result.
 */
function runGit(args: string[]): { success: boolean; stdout: string; stderr: string } {
    const result = spawnSync(["git", ...args], {
        stdout: "pipe",
        stderr: "pipe",
    });

    return {
        success: result.success,
        stdout: result.stdout?.toString().trim() || "",
        stderr: result.stderr?.toString().trim() || ""
    };
}

export async function performUpdate(): Promise<UpdateStatus> {
    Logger.info("SYSTEM", `Checking for system updates (Current: v${pkg.version})...`);
    let stashed = false;

    try {
        // 1. Check if git is available
        const gitVersion = runGit(["--version"]);
        if (!gitVersion.success) {
            Logger.warn("SYSTEM", "Git not found, skipping update check.");
            return { success: false, message: "Git is not installed on this system." };
        }

        // 2. Check if remote origin exists and validate URL
        const remoteResult = runGit(["remote", "get-url", "origin"]);
        if (!remoteResult.success) {
            Logger.warn("SYSTEM", "No git origin found, cannot update.");
            return {
                success: false,
                message: "No 'origin' remote found. Please link to a repository first."
            };
        }

        const remoteUrl = remoteResult.stdout;
        // Basic injection guard: ensure it looks like a git URL
        if (!/^(https?:\/\/|git@|ssh:\/\/).*/.test(remoteUrl)) {
            Logger.error("SYSTEM", `Invalid or suspicious git remote: ${remoteUrl}`);
            return { success: false, message: "Invalid git remote URL." };
        }

        // Security: Whitelist Check
        const isTrusted = TRUSTED_REMOTES.some(pattern => pattern.test(remoteUrl));
        if (!isTrusted) {
            Logger.error("SYSTEM", `Untrusted git remote: ${remoteUrl}. Update aborted for security.`);
            return {
                success: false,
                message: "Update source is not in the trusted whitelist. Manual intervention required."
            };
        }

        // 3. Check for local main branch
        const branchResult = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
        if (!branchResult.success || branchResult.stdout !== "main") {
            Logger.warn("SYSTEM", `Not on main branch (${branchResult.stdout}), skipping auto-update.`);
            return { success: false, message: "Updates only supported on 'main' branch." };
        }

        // 4. Perform Non-Destructive Update
        Logger.info("SYSTEM", `Updating from ${remoteUrl}...`);

        // Stash local changes
        const stashResult = runGit(["stash"]);
        stashed = !stashResult.stdout.includes("No local changes to save");

        // Fetch
        const fetchResult = runGit(["fetch", "origin"]);
        if (!fetchResult.success) {
            if (stashed) runGit(["stash", "pop"]);
            return { success: false, message: "Failed to fetch updates from remote." };
        }

        // 5. Integrity Verification (Post-Fetch)
        // Check if the fetched commit is signed if signing is enabled (optional/strict)
        // For now, we verify that the remote HEAD is reachable and we have a valid hash
        const verifyResult = runGit(["rev-parse", "FETCH_HEAD"]);
        if (!verifyResult.success) {
            Logger.error("SYSTEM", "Integrity check failed: Could not resolve FETCH_HEAD");
            if (stashed) runGit(["stash", "pop"]);
            return { success: false, message: "Update integrity check failed. Aborting." };
        }

        // Optional: Run 'git log -1 --pretty=%G?' to check signature status
        // %G? returns 'N' for no signature, 'G' for good, 'B' for bad, etc.
        const sigResult = runGit(["log", "-1", "--pretty=%G?", "FETCH_HEAD"]);
        if (sigResult.stdout === "B") {
            Logger.error("SYSTEM", "CRITICAL: Fetched commit has a BAD signature! Security breach suspected.");
            if (stashed) runGit(["stash", "pop"]);
            return { success: false, message: "SECURITY ALERT: Update signature verification failed!" };
        }

        // 6. Pull (Rebase) if integrity passed
        const pullResult = runGit(["pull", "--rebase", "origin", "main"]);

        // Always try to pop stash if we stashed
        if (stashed) {
            runGit(["stash", "pop"]);
        }

        if (!pullResult.success) {
            Logger.error("SYSTEM", "Pull failed", pullResult.stderr);
            return { success: false, message: "Failed to pull updates. You may have local merge conflicts." };
        }

        Logger.info("SYSTEM", "System updated successfully.");
        return { success: true, message: `Updated successfully from ${remoteUrl}` };

    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("SYSTEM", "Unexpected update error", error);
        if (stashed) runGit(["stash", "pop"]);
        return { success: false, message: `Unexpected error: ${error.message}` };
    }
}
