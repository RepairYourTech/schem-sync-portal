import { Env } from "./env";
import { writeFileSync, writeSync } from "fs";
import { join } from "path";

export class Clipboard {
    /**
     * Attempts to copy text to the system clipboard using available CLI tools.
     * Returns true if successful, false otherwise.
     */
    static async copy(text: string): Promise<boolean> {
        const isWayland = !!process.env.WAYLAND_DISPLAY;
        const tools = isWayland
            ? [
                { cmd: "wl-copy", args: [] },
                { cmd: "xclip", args: ["-selection", "clipboard"] },
                { cmd: "xsel", args: ["--clipboard", "--input"] },
                { cmd: "pbcopy", args: [] },
                { cmd: "clip.exe", args: [] }
            ]
            : [
                { cmd: "xclip", args: ["-selection", "clipboard"] },
                { cmd: "xsel", args: ["--clipboard", "--input"] },
                { cmd: "wl-copy", args: [] },
                { cmd: "pbcopy", args: [] },
                { cmd: "clip.exe", args: [] }
            ];

        for (const tool of tools) {
            try {
                const path = Env.findBinary([tool.cmd]);
                if (path) {
                    const proc = Bun.spawn([path, ...tool.args], {
                        stdin: Buffer.from(text),
                    });
                    const exitCode = await proc.exited;
                    if (exitCode === 0) return true;
                }
            } catch {
                // Try next tool
            }
        }

        // Final attempt: OSC 52 (Terminal Escape Sequence)
        // Works in modern terminals (VS Code, iTerm, Kitty, Alacritty, Foot)
        try {
            // OSC 52 has a practical limit in many terminals (often 64KB for the whole sequence)
            // We truncate to ~32KB of text to ensure the base64 payload fits safely.
            const safeText = text.length > 32768 ? text.slice(-32768) : text;
            const base64 = Buffer.from(safeText).toString("base64");
            let sequence = `\x1b]52;c;${base64}\x1b\\`; // Use ST (\x1b\\) instead of BEL (\x07)

            // Terminal Multiplexer Wrappers
            if (process.env.TMUX) {
                // tmux wrap: DCS tmux ; {sequence} ST
                sequence = `\x1bPtmux;\x1b${sequence}\x1b\\`;
            } else if (process.env.TERM?.startsWith("screen")) {
                // screen wrap: DCS {sequence} ST
                sequence = `\x1bP${sequence}\x1b\\`;
            }

            // Write directly to stdout file descriptor to bypass any higher-level buffering/hooking
            try {
                writeSync(1, Buffer.from(sequence));
            } catch {
                process.stdout.write(sequence);
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Fallback that saves the content to a file and returns the path.
     */
    static fallbackToFile(text: string): string {
        const { desktopDir, home } = Env.getPaths();
        const targetDir = desktopDir && desktopDir.trim() !== "" ? desktopDir : home;
        const filename = `portal-logs-${new Date().getTime()}.txt`;
        const fullPath = join(targetDir, filename);

        try {
            writeFileSync(fullPath, text);
            return fullPath;
        } catch {
            return "failed to save fallback";
        }
    }
}
