import fs from 'fs';

const filePath = '/home/birdman/schem-sync-portal/src/components/Wizard.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// The guide blocks are standalone boxes. We can identify them by their step context or by the fact they don't have a key={i}
// Actually, it's safer to just look for the specific blocks.

const guideSteps = ["gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4"];

guideSteps.forEach(step => {
    const regex = new RegExp(`step === "${step}"[\\s\\S]+?onMouseDown=\\{\\(\\)[\\s\\S]+?const idx = typeof i !== "undefined" \\? i : 0;`, 'g');
    content = content.replace(regex, (match) => {
        return match.replace('const idx = typeof i !== "undefined" ? i : 0;', 'const idx = 0;');
    });
});

fs.writeFileSync(filePath, content);
console.log('Wizard guide standalone buttons fixed.');
