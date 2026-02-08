export const KEEP_EXTS = [
    ".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb",
    ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq",
    ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt", ".json"
];

// "The Goods" - Only these survive Lean Shield extraction
export const LEAN_STRICT_WHITELIST = [
    ".pdf", ".txt",
    ".brd", ".pcb", ".tvw", ".fz", ".faz", ".cad", ".bdv", ".bv", ".cst", ".gr", ".obdata",
    ".sqlite3", ".obdlocal", ".obdlog", ".obdq"
];

// "The Excess" - Explicitly purged in Lean Mode even if safe
export const LEAN_STRICT_BLACKLIST = [
    ".bin", ".rom", ".cap", ".fd", ".hex", ".wph",
    ".exe", ".dll", ".sys", ".msi", ".bat", ".cmd", ".vbs", ".js", ".com", ".scr",
    ".inf", ".cat", ".drv"
];

export const SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"];

export const GARBAGE_PATTERNS = [
    // === EXACT MALWARE INDICATORS (High Confidence) ===
    "lpk.dll",                                           // DLL hijacking attack vector
    "Open boardview using this TVW specific software",  // Exact cracked software package name
    "Chinafix", "chinafix",                            // Known malware distributor signature
    "程序_原厂_迅维版主分享",                              // Specific Chinese nested RAR pattern

    // === EXECUTABLE PATTERNS (High Confidence) ===
    "crack.exe", "Crack.exe",
    "patch.exe", "Patch.exe",
    "keygen.exe", "Keygen.exe",
    "loader.exe", "Loader.exe",
    "activator.exe", "Activator.exe",
    "bypass.exe", "Bypass.exe",
    ".exe.bak", ".exe.BAK",                            // Backup of cracked executables
    "DOS4GW.EXE", "DOS4GW",                            // Suspicious in BIOS context

    // === DIRECTORY/FOLDER PATTERNS (High Confidence) ===
    "crack/", "Crack/",
    "keygen/", "Keygen/",
    "medicine/", "Medicine/"
];

export const PRIORITY_FILENAMES = [
    // Static list of Google-flagged filenames for PRIORITY DOWNLOAD only
    // These are used to identify risky files and download them first
    // They are NOT automatically added to exclude file - only processed files are
    "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip",
    "GV-R580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-4GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R939XG1 GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R938WF2-4GD-1.0 Boardview.zip",
    "IOT73 V3.0 TG-B75.zip",
    "GV-R938G1 GAMING-4GD-1.02 Boardview.zip",
    "GV-RX470G1 GAMING-4GD-0.2 Boardview.zip",
    "GV-RX480G1 GAMING-4GD-1.1 Boardview.zip",
    "BIOS_K54C usb 3.0_factory-Chinafix.zip",
    "BIOS_K54LY usb 3.0_factory-Chinafix.zip",
    "GV-RX570AORUS-4GD-1.0 Boardview.zip",
    "GV-RX580AORUS-4GD-0.2-1.1 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0 Boardview.zip",
    "GV-RX590GAMING-8GD-1.0 Boardview.zip",
    "BIOS_k53SJ usb 3.0 K53SJFW05300A_factory-Chinafix.zip",
    "BIOS_k53sv usb 3.0 _factory-Chinafix.zip",
    "BIOS_u310 U410_Chinafix.zip",
    "GV-N3070EAGLE OC-8GD-1.0 Boardview.zip",
    "DANL9MB18F0 (tvw).rar",
    "GV-N4090GAMING-OC-24GD r1.0 boardview.zip"
];


export const LEAN_MODE_EXCLUDE_PATTERNS = [
    // Strict path-scoped patterns to prevent false positives (e.g., BIOS_Schematic.pdf)
    "/bios/", "\\bios\\", "bios/", "bios\\",
    "/firmware/", "\\firmware\\", "firmware/", "firmware\\",
    "/drivers/", "\\drivers\\", "drivers/", "drivers\\",
    "/driver/", "\\driver\\", "driver/", "driver\\",
    "/utilities/", "\\utilities\\", "utilities/", "utilities\\",
    "/utility/", "\\utility\\", "utility/", "utility\\",
    "/tools/", "\\tools\\", "tools/", "tools\\",
    "/software/", "\\software\\", "software/", "software\\",
    "/update/", "\\update\\", "update/", "update\\",
    "/updates/", "\\updates\\", "updates/", "updates\\",
    "/me_region/", "\\me_region\\", "me_region/", "me_region\\",
    "/ec/", "\\ec\\",
    "/fw/", "\\fw\\",
    "setup.exe", "install.exe", "installer.exe"
];

export const VALUABLE_ARCHIVE_INDICATORS = [
    // Filenames that indicate the archive likely contains Boardviews/Schematics
    "boardview", "Boardview", "BOARDVIEW",
    "schematic", "Schematic", "SCHEMATIC",
    ".tvw", ".brd", ".cad", ".fz", ".asc", ".bvr", // Boardview extensions
    ".pdf", ".PDF",                                // Schematics often in PDF
    "BRD_", "SCH_"                                 // Common prefixes
];

export const LEAN_MODE_PRIORITY_FILENAMES = [
    // Archives known to be valuable to prioritize in Lean Mode
    // This flips the logic of risky sweep -> we want the GOOD stuff first
    "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip",
    "GV-R580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-4GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R939XG1 GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R938WF2-4GD-1.0 Boardview.zip",
    "IOT73 V3.0 TG-B75.zip",
    "GV-R938G1 GAMING-4GD-1.02 Boardview.zip",
    "GV-RX470G1 GAMING-4GD-0.2 Boardview.zip",
    "GV-RX480G1 GAMING-4GD-1.1 Boardview.zip",
    "GV-RX570AORUS-4GD-1.0 Boardview.zip",
    "GV-RX580AORUS-4GD-0.2-1.1 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0 Boardview.zip",
    "GV-RX590GAMING-8GD-1.0 Boardview.zip",
    "GV-N3070EAGLE OC-8GD-1.0 Boardview.zip",
    "DANL9MB18F0 (tvw).rar",
    "GV-N4090GAMING-OC-24GD r1.0 boardview.zip"
];
