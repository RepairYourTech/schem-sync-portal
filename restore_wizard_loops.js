import fs from 'fs';

const filePath = '/home/birdman/schem-sync-portal/src/components/Wizard.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Fix all occurrences of the problematic ternary to just use 'i' if it's inside a loop.
// Actually, since I have 'i' in the loop, I can just use it.
// To be safe and surgical, I'll find the blocks.

// Replace the fallback 'const idx = 0' or ternary with 'const idx = i' inside map loops.
// We can identify map loops by '.map((opt, i) =>' or similar.

// First, fix the ones I broke with 'const idx = 0' in source_choice etc.
content = content.replace(
    /const options = getOptions\(\);\s+const idx = 0;\s+const opt = options\[idx\];/g,
    'const options = getOptions();\n                                        const idx = i;\n                                        const opt = options[idx];'
);

// Second, fix the ternary ones to just use 'i' to be clean, but ONLY where 'i' is actually in scope.
// TS was complaining about 'i' NOT being in scope in some blocks.
// Let's check which ones are which.

// I'll use a more surgical approach for the loop ones.
const loopPatterns = [
    "source_select", "backup_provider", "sync_mode", "sec_policy", "sec_toggle", "deploy"
];

loopPatterns.forEach(pattern => {
    // This regex looks for code that looks like it's in a loop (using 'key={i}' or similar)
    const regex = new RegExp(`(<box[\\s\\S]+?key=\\{i\\}[\\s\\S]+?onMouseDown=\\{[\\s\\S]+?const idx = )(typeof i !== "undefined" \\? i : 0|0)(;[\\s\\S]+?const opt = options\\[idx\\];)`, 'g');
    content = content.replace(regex, '$1i$3');
});

fs.writeFileSync(filePath, content);
console.log('Wizard.tsx loop indices restored.');
