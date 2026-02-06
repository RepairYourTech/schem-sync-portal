import type { ShieldManifest, ManifestDiff } from "./types";
import pkg from "../../../package.json";

/**
 * Handles serialization and deserialization of Shield Manifest files.
 */
export class ManifestParser {
    private static readonly VERSION = pkg.version;

    /**
     * Parses the content of an upsync-manifest.txt file.
     */
    static parse(content: string): ShieldManifest {
        const lines = content.split("\n").map(l => l.trim());
        const files: string[] = [];
        let generatedAt = new Date().toISOString();
        let version = this.VERSION;
        let policy: "purge" | "isolate" = "purge";

        for (const line of lines) {
            if (line.startsWith("#")) {
                const header = line.slice(1).trim();
                if (header.startsWith("Generated:")) {
                    generatedAt = header.replace("Generated:", "").trim();
                } else if (header.startsWith("Shield version:")) {
                    version = header.replace("Shield version:", "").trim();
                } else if (header.startsWith("Policy:")) {
                    const p = header.replace("Policy:", "").trim().toLowerCase();
                    if (p === "isolate") policy = "isolate";
                    else policy = "purge";
                }
                continue;
            }
            if (line.length > 0) {
                files.push(line);
            }
        }

        return {
            generatedAt,
            version,
            policy,
            files: files.sort()
        };
    }

    /**
     * Converts a ShieldManifest object to a string for writing to disk.
     */
    static stringify(manifest: ShieldManifest): string {
        const header = [
            `# Generated: ${manifest.generatedAt}`,
            `# Total files: ${manifest.files.length}`,
            `# Shield version: ${manifest.version}`,
            `# Policy: ${manifest.policy}`,
            ""
        ];

        return header.join("\n") + manifest.files.sort().join("\n") + "\n";
    }

    /**
     * Diffs two manifests to identify added and removed files.
     */
    static diff(oldManifest: ShieldManifest, newManifest: ShieldManifest): ManifestDiff {
        const oldSet = new Set(oldManifest.files);
        const newSet = new Set(newManifest.files);

        const added = newManifest.files.filter(f => !oldSet.has(f));
        const removed = oldManifest.files.filter(f => !newSet.has(f));

        return {
            added,
            removed,
            totalCount: newManifest.files.length
        };
    }
}
