import { readFileSync, writeFileSync, existsSync } from "fs";

const args = process.argv.slice(2);
const command = args[0];

// Simulation settings from environment or defaults
const LATENCY_MS = parseInt(process.env.MOCK_LATENCY || "100");
const FAIL_PROBABILITY = parseFloat(process.env.MOCK_FAIL_PROBABILITY || "0");
const SHOULD_REJECT_CREDENTIALS = process.env.MOCK_REJECT_CREDENTIALS === "true";

async function simulate() {
    // Determine command even if --config is present
    let effectiveCommand = command;
    let configPath = "";

    if (command === "--config") {
        configPath = args[1]!;
        effectiveCommand = args[2]!;
    }

    if (SHOULD_REJECT_CREDENTIALS) {
        console.error(JSON.stringify({ level: "error", msg: "401 Unauthorized: Invalid credentials", time: new Date().toISOString() }));
        process.exit(1);
    }

    if (Math.random() < FAIL_PROBABILITY) {
        console.error(JSON.stringify({ level: "error", msg: "Unexpected network failure", time: new Date().toISOString() }));
        process.exit(1);
    }

    if (effectiveCommand === "sync" || effectiveCommand === "copy") {
        // Enforce JSON logging if requested (Survivor Logic)
        const useJson = args.includes("--use-json-log");

        // Simulate progress
        for (let i = 0; i <= 100; i += 10) {
            if (useJson) {
                // Emit structured stats block
                console.error(JSON.stringify({
                    level: "info",
                    stats: {
                        percentage: i,
                        speed: 1024 * 1024,
                        bytes: i * 1024 * 1024,
                        totalBytes: 100 * 1024 * 1024,
                        eta: 10 - Math.floor(i / 10),
                        transferring: [
                            { name: `file_${i}.bin`, size: 100 * 1024 * 1024, bytes: i * 1024 * 1024, speed: 1024 * 1024, eta: 100 - i },
                            { name: `file_${i + 1}.bin`, size: 50 * 1024 * 1024, bytes: Math.min(50, i + 5) * 1024 * 1024, speed: 512 * 1024, eta: 90 - i }
                        ]
                    },
                    time: new Date().toISOString()
                }));
            } else {
                // Human readable fallback (Legacy)
                console.log(`*        Transferred:   	   ${(i / 10).toFixed(3)} MiB / 10.000 MiB, ${i}%, 1.0 MiB/s, ETA ${10 - i / 10}s`);
                console.log(`Files:               ${i / 10} / 10, ${i}%`);
                console.log(`* file_${i}.bin: ${i}% /100 MiB, 1 MiB/s, ${100 - i}s`);
            }

            await new Promise(r => setTimeout(r, LATENCY_MS));
        }
    } else if (effectiveCommand === "config" && args.includes("delete")) {
        // Handle: rclone config delete name
        const nameToDelete = args[args.indexOf("delete") + 1];
        if (configPath && nameToDelete && existsSync(configPath)) {
            const content = readFileSync(configPath, "utf8");
            const lines = content.split(/\r?\n/);
            const filteredLines: string[] = [];
            let currentSection: string | null = null;
            let isRemoving = false;

            for (const line of lines) {
                const headerMatch = line.trim().match(/^\[([^\]]+)\]/);
                if (headerMatch) {
                    currentSection = headerMatch[1]!;
                    isRemoving = (currentSection === nameToDelete);
                }
                if (!isRemoving) filteredLines.push(line);
            }
            writeFileSync(configPath, filteredLines.join("\n"));
        }
    } else if (effectiveCommand === "copyto" && args.some(a => a.includes("manifest.txt"))) {
        // Handle: rclone copyto portal_source:/manifest.txt local_path
        // Destination is usually the argument after the remote source
        const copytoIdx = args.indexOf("copyto");
        const dest = (copytoIdx !== -1) ? args[copytoIdx + 2] : null;
        if (dest && !dest.startsWith("-")) {
            writeFileSync(dest, "file1.bin\nfile2.bin\nfile3.bin\n");
        }
    }

    process.exit(0);
}

simulate();
