import { join } from "path";
import { existsSync, mkdirSync, symlinkSync, writeFileSync, chmodSync, unlinkSync } from "fs";
import { Env } from "./env";
import { Logger } from "./logger";

export function isSystemBootstrapped(): boolean {
    const { appsDir, desktopDir } = Env.getPaths();
    const appName = Env.getDisplayName();

    // Check main integration
    const installed = existsSync(join(appsDir, appName));

    // On Linux/Win, strict check desktop too if it exists
    if (!Env.isMac && existsSync(desktopDir)) {
        return installed && existsSync(join(desktopDir, appName));
    }

    return installed;
}

export function removeSystemBootstrap(): void {
    const { appsDir, binDir, desktopDir } = Env.getPaths();
    const appName = Env.getDisplayName();

    // Standardize Names
    const files = [
        // Current Names
        join(appsDir, appName),
        join(desktopDir, appName),
        // Legacy Names (Cleanup)
        join(appsDir, "schem-sync-next.desktop"),
        join(desktopDir, "schem-sync-next.desktop"),
        join(appsDir, "SchematicSync.command"),
        join(appsDir, "SchematicSync.bat")
    ];

    if (!Env.isWin && !Env.isMac && binDir) {
        files.push(join(binDir, Env.APP_NAME_ID));
        files.push(join(binDir, "schem-sync-next"));
    }

    files.forEach(p => {
        try {
            if (existsSync(p)) {
                unlinkSync(p);
            }
        } catch (err) {
            Logger.error("DEPLOY", `Failed to remove bootstrap file: ${p}`, err);
        }
    });
}

export function bootstrapSystem(scriptPath: string): void {
    const paths = Env.getPaths();

    try {
        [paths.appsDir, paths.binDir].forEach(d => {
            if (d && !existsSync(d)) mkdirSync(d, { recursive: true });
        });

        if (Env.isWin) {
            const batchPath = join(paths.appsDir, Env.getDisplayName());
            const content = `@echo off\ncd /d "${process.cwd()}"\nbun run src/index.tsx\npause`;
            writeFileSync(batchPath, content);

            if (paths.desktopDir && existsSync(paths.desktopDir)) {
                writeFileSync(join(paths.desktopDir, Env.getDisplayName()), content);
            }
        } else if (Env.isMac) {
            const scriptFile = join(paths.appsDir, Env.getDisplayName());
            const content = `#!/bin/bash\ncd "${process.cwd()}"\nbun run src/index.tsx\nread -p "Press Enter to close..."`;
            writeFileSync(scriptFile, content);
            chmodSync(scriptFile, 0o755);
        } else {
            // Linux
            const binPath = join(paths.binDir, Env.APP_NAME_ID);
            if (!existsSync(binPath)) {
                try {
                    symlinkSync(scriptPath, binPath);
                    Logger.debug("DEPLOY", `Created symlink: ${binPath} -> ${scriptPath}`);
                } catch (e) {
                    Logger.error("DEPLOY", "Symlink creation failed", e);
                }
            }

            const desktopPath = join(paths.appsDir, Env.getDisplayName());

            // Icon handling: Try to find one or fallback
            const content = `[Desktop Entry]\nName=${Env.APP_NAME_PROPER}\nComment=Secure Multi-Cloud Schematic Manager\nExec=gnome-terminal -- bash -c "cd ${process.cwd()} && bun run src/index.tsx; read -p 'Mission Complete. Press Enter to Close...'"\nIcon=utilities-terminal\nTerminal=false\nType=Application\nCategories=Utility;System;`;

            writeFileSync(desktopPath, content);
            chmodSync(desktopPath, 0o755);

            // Mirror to physical Desktop if it exists
            if (existsSync(paths.desktopDir)) {
                const physicalPath = join(paths.desktopDir, Env.getDisplayName());
                writeFileSync(physicalPath, content);
                chmodSync(physicalPath, 0o755);
            }
        }
        Logger.info("DEPLOY", "System bootstrapped successfully");
    } catch (err) {
        Logger.error("DEPLOY", "System bootstrap failed", err);
        throw err; // Re-throw to let UI know
    }
}
