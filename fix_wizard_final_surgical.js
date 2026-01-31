import fs from 'fs';

const filePath = '/home/birdman/schem-sync-portal/src/components/Wizard.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

const guideSteps = ["gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4"];

guideSteps.forEach(step => {
    // Find the block for this step
    const startMarker = `step === "${step}"`;
    const startIdx = content.indexOf(startMarker);
    if (startIdx !== -1) {
        // Find the next onMouseDown within this block
        const mouseDownIdx = content.indexOf('onMouseDown', startIdx);
        if (mouseDownIdx !== -1 && mouseDownIdx < startIdx + 1000) {
            // Find the end of this onMouseDown block (approx)
            const endIdx = content.indexOf('}}', mouseDownIdx);
            if (endIdx !== -1) {
                const block = content.substring(mouseDownIdx, endIdx);
                // Replace const idx = i; with const idx = 0; ONLY within this block
                const fixedBlock = block.replace(/const idx = i;/g, 'const idx = 0;');
                content = content.substring(0, mouseDownIdx) + fixedBlock + content.substring(endIdx);
            }
        }
    }
});

fs.writeFileSync(filePath, content);
console.log('Wizard guides fixed surgically (attempt 2).');
