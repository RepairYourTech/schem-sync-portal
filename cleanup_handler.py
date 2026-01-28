import os
import subprocess
import shutil
from pathlib import Path

# Detect 7z binary
SEVEN_ZIP_BIN = shutil.which("7z") or shutil.which("7za") or "7z"

# Extensions to extract and keep
KEEP_EXTS = {".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb", 
             ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq", 
             ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt"}

# Patterns that indicate a file is a BIOS UTILITY (WE MUST KEEP THESE)
SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"]

# Patterns that are 100% GARBAGE (GOOGLE FLAGS THESE)
GARBAGE_PATTERNS = ["crack", "patch", "keygen", "loader", "bypass", "activator", "lpk.dll", "TVW specific software"]

def clean_zip(zip_path, local_base_dir, exclude_file_path):
    zip_path = Path(zip_path)
    base_dir = Path(local_base_dir)
    exclude_file = Path(exclude_file_path)
    
    dir_path = zip_path.parent
    rel_path = zip_path.relative_to(base_dir)
    
    # Safety: check if it looks like a BIOS ZIP (to prevent accidental tool loss)
    if "bios" in str(rel_path).lower():
        print(f"[SKIP] BIOS archive (protected): {rel_path}")
        return

    print(f"--- Processing: {rel_path} ---")
    
    # 1. Peek inside using 7z (handles ZIP and nested RAR/7z)
    try:
        result = subprocess.run(["7z", "l", str(zip_path), "-r"], capture_output=True, text=True, check=True)
        internal_listing = result.stdout
    except Exception as e:
        print(f"[ERROR] Could not read archive {rel_path}: {e}")
        return

    # Check for garbage
    has_garbage = any(p.lower() in internal_listing.lower() for p in GARBAGE_PATTERNS)
    # Check for safety (BIOS Tools)
    has_safe_tools = any(p.lower() in internal_listing.lower() for p in SAFE_PATTERNS)

    if has_garbage and not has_safe_tools:
        print(f"[PURGE] Detected malware/bloat patterns. Rescuing safe data...")
        
        # 2. Extract ONLY safe extensions from the entire depth
        for ext in KEEP_EXTS:
            # 7z e extracts to a flattend directory (no paths)
            # We use '*' + ext to match anything ending in that extension
            subprocess.run(["7z", "e", str(zip_path), f"*{ext}", f"-o{dir_path}", "-r", "-y"], 
                           capture_output=True, check=False)

        # 3. Add to exclusion list
        if exclude_file.exists():
            with open(exclude_file, "a") as f:
                f.write(f"{rel_path}\n")
        
        # 4. Remove original ZIP
        try:
            zip_path.unlink()
            print(f"[SUCCESS] Cleaned and removed {rel_path}")
        except Exception as e:
            print(f"[ERROR] Failed to delete original ZIP: {e}")
    else:
        print(f"[SAFE] Archive contains no known traps or includes BIOS tools.")

def run_cleanup_sweep(target_dir, exclude_file):
    print(f"\n[CLEANUP] Starting system-agnostic sweep in: {target_dir}")
    target_path = Path(target_dir)
    for zip_file in target_path.rglob("*.zip"):
        clean_zip(zip_file, target_dir, exclude_file)
