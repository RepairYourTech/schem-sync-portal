/** @jsxImportSource @opentui/react */
import React from "react";

interface ProviderIconProps {
    provider: string;
    version?: 2 | 3;
    color?: string;
}

// Nerd Font glyph mappings: v2 (legacy) → v3 (modern FA/MDI)
// Reference: https://www.nerdfonts.com/cheat-sheet
const ICONS: Record<string, { v2: string; v3: string }> = {
    copyparty: { v2: "\uf233", v3: "\udb80\udee8" },  // server
    gdrive: { v2: "\uf1a0", v3: "\udb82\ude3a" },  // google
    b2: { v2: "\uf0c2", v3: "\udb81\udd04" },  // cloud-upload
    sftp: { v2: "\uf489", v3: "\udb81\udea5" },  // terminal/ssh
    pcloud: { v2: "\uf0c2", v3: "\udb81\udd02" },  // cloud
    onedrive: { v2: "\uf0c2", v3: "\udb82\ude3c" },  // microsoft
    dropbox: { v2: "\uf16b", v3: "\udb82\ude38" },  // dropbox
    mega: { v2: "\uf0c2", v3: "\udb81\udd04" },  // cloud
    r2: { v2: "\uf0c2", v3: "\udb80\ude66" },  // cloudflare
};

const FALLBACK = { v2: "\uf0c2", v3: "\udb81\udd02" }; // generic cloud

export function ProviderIcon({ provider, version = 2, color }: ProviderIconProps) {
    const icons = ICONS[provider] || FALLBACK;
    const glyph = version === 3 ? icons.v3 : icons.v2;

    return <text fg={color}>{String(glyph)}</text>;
}
