/**
 * MockRclone: Simulates rclone behavior for testing.
 * Usage: bun run src/tests/mock_rclone.ts <args>
 */

const args = process.argv.slice(2);
const command = args[0];

// Simulation settings from environment or defaults
const LATENCY_MS = parseInt(process.env.MOCK_LATENCY || "100");
const FAIL_PROBABILITY = parseFloat(process.env.MOCK_FAIL_PROBABILITY || "0");
const SHOULD_REJECT_CREDENTIALS = process.env.MOCK_REJECT_CREDENTIALS === "true";

async function simulate() {
    console.log(`[MOCK] Command: ${command}, Fail Prob: ${process.env.MOCK_FAIL_PROBABILITY}`);
    if (SHOULD_REJECT_CREDENTIALS) {
        console.error(JSON.stringify({ level: "error", msg: "401 Unauthorized: Invalid credentials", time: new Date().toISOString() }));
        process.exit(1);
    }

    if (Math.random() < FAIL_PROBABILITY) {
        console.error(JSON.stringify({ level: "error", msg: "Unexpected network failure", time: new Date().toISOString() }));
        process.exit(1);
    }

    if (command === "sync" || command === "copy") {
        // Simulate progress
        for (let i = 0; i <= 100; i += 10) {
            // Stats line: * Transferred: 1.234 MiB / 10.000 MiB, 10%, 1.0 MiB/s, ETA 9s
            const transferred = (i / 10).toFixed(3);
            console.log(`*        Transferred:   	   ${transferred} MiB / 10.000 MiB, ${i}%, 1.0 MiB/s, ETA ${10 - i / 10}s`);

            // Files line: Files: 1 / 10, 10%
            console.log(`Files:               ${i / 10} / 10, ${i}%`);

            await new Promise(r => setTimeout(r, LATENCY_MS));
        }
    }

    process.exit(0);
}

simulate();
