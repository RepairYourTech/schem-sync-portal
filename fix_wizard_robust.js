import fs from 'fs';

const filePath = '/home/birdman/schem-sync-portal/src/components/Wizard.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// The loops have key={i} and then onMouseDown... const idx = i;
// Standalone buttons DON'T have key={i} before them.

// We want to replace idx = i with idx = 0 ONLY if it's NOT inside a loop box.
// A simpler way: Find all idx = i; and if the box it's in doesn't have key={i}, fix it.

// Let's use a very specific replacement for the guide blocks.
const steps = ["gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4"];

steps.forEach(step => {
    // Regex matches the whole step block and corrects the internal idx.
    const regex = new RegExp(`(step === "${step}"[\\s\\S]+?onMouseDown=\\{[\\s\\S]+?const idx = )i(;[\\s\\S]+?const opt = options\\[idx\\];)`, 'g');
    content = content.replace(regex, '$10$2');
});

fs.writeFileSync(filePath, content);
console.log('Wizard guides fixed with robust regex.');
