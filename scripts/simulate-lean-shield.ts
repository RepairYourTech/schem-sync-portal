
import { readFileSync } from "fs";
import { LEAN_STRICT_WHITELIST, LEAN_STRICT_BLACKLIST, LEAN_MODE_EXCLUDE_PATTERNS } from "../src/lib/shield/patterns";

// Tier 0: Download Gate (Path-Aware)
function isExcludedAtPathGate(relPath: string): boolean {
    const lowerPath = relPath.toLowerCase().replace(/\\/g, "/");
    return LEAN_MODE_EXCLUDE_PATTERNS.some(p => {
        const lowerP = p.toLowerCase().replace(/\\/g, "/");
        const normalizedPattern = lowerP.startsWith("/") ? lowerP : "/" + lowerP;
        return ("/" + lowerPath).includes(normalizedPattern);
    });
}

const manifestPath = process.argv[2];
if (!manifestPath) {
    console.error("Usage: bun scripts/simulate-lean-shield.ts <manifest-path>");
    process.exit(1);
}
const lines = readFileSync(manifestPath, "utf-8").split("\n").filter(l => l.trim());

console.log(`Analyzing ${lines.length} lines for SURGICAL LEAN SHIELD simulation...\n`);

let blockedByInitialGate = 0;
let passedToShield = 0;

let shieldKeptGoods = 0;
let shieldStrippedExcess = 0;
let shieldKeptAmbiguous = 0;

const strippedExamples: string[] = [];
const goodsExamples: string[] = [];
const ambiguousExamples: string[] = [];

for (const line of lines) {
    if (isExcludedAtPathGate(line)) {
        blockedByInitialGate++;
        continue;
    }

    passedToShield++;

    const lowerLine = line.toLowerCase();
    const ext = "." + (lowerLine.split(".").pop() || "");

    const isGood = LEAN_STRICT_WHITELIST.includes(ext);
    const isExcess = LEAN_STRICT_BLACKLIST.includes(ext);

    if (isGood) {
        shieldKeptGoods++;
        if (goodsExamples.length < 10) goodsExamples.push(line);
    } else if (isExcess) {
        shieldStrippedExcess++;
        if (strippedExamples.length < 10) strippedExamples.push(line);
    } else {
        shieldKeptAmbiguous++;
        if (ambiguousExamples.length < 10) ambiguousExamples.push(line);
    }
}

console.log(`[DOWNLOAD GATE] Blocked (Surgical Patterns): ${blockedByInitialGate} | Passing to Shield: ${passedToShield}`);
console.log(`[LEAN SHIELD] Preserved Goods (Whitelist): ${shieldKeptGoods}`);
console.log(`[LEAN SHIELD] Stripped Excess (Blacklist/Non-Whitelisted): ${shieldStrippedExcess}`);
console.log(`[LEAN SHIELD] Kept Ambiguous: ${shieldKeptAmbiguous}\n`);

const totalKept = shieldKeptGoods + shieldKeptAmbiguous;
const reduction = lines.length > 0 ? ((lines.length - totalKept) / lines.length) * 100 : 0;

console.log(`=== LEAN IMPACT SUMMARY ===`);
console.log(`Total Original Files: ${lines.length}`);
console.log(`Total Lean Files:     ${totalKept}`);
console.log(`Storage Reduction:    ${reduction.toFixed(2)}%\n`);

console.log("=== EXAMPLES: STRIPPED BY LEAN SHIELD ===");
strippedExamples.forEach(e => console.log(`[STRIP] ${e}`));
console.log("...");

console.log("\n=== EXAMPLES: PRESERVED GOODS ===");
goodsExamples.forEach(e => console.log(`[KEEP ] ${e}`));
console.log("...");
