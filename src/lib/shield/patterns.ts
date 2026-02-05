export const KEEP_EXTS = [
    ".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb",
    ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq",
    ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt", ".json"
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
