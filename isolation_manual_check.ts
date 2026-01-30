import { updateGdriveRemote, removePortalConfig } from "./src/lib/rclone.ts";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const rcloneConfig = join(process.env.HOME || "", ".config", "rclone", "rclone.conf");

console.log("--- CONFIG ISOLATION SAFETY TEST START ---");

// 1. Create Dummy Portal Remote
console.log("Step 1: Creating [gdrive_portal_test]...");
updateGdriveRemote("gdrive_portal_test", "TEST_CLIENT_ID", "TEST_SECRET", "TEST_TOKEN");

if (readFileSync(rcloneConfig, "utf8").includes("[gdrive_portal_test]")) {
    console.log("✅ Dummy remote created successfully.");
} else {
    console.log("❌ Failed to create dummy remote.");
    process.exit(1);
}

// 2. Surgical Removal
console.log("Step 2: Performing surgical removal of [gdrive_portal_test]...");
removePortalConfig(["gdrive_portal_test"]);

const finalContent = readFileSync(rcloneConfig, "utf8");

if (!finalContent.includes("[gdrive_portal_test]")) {
    console.log("✅ Dummy remote removed surgically.");
} else {
    console.log("❌ Surgical removal failed (Remote still present).");
    process.exit(1);
}

// 3. Config Integrity Check
if (finalContent.includes("[gdrive]")) {
    console.log("✅ CONFIG INTEGRITY VERIFIED: [gdrive] survived the purge.");
} else {
    console.log("❌ CRITICAL FAILURE: [gdrive] was deleted during surgical wipe!");
    process.exit(1);
}

console.log("--- CONFIG ISOLATION SAFETY TEST COMPLETE ---");
