import os
import subprocess
import shutil
from pathlib import Path

# Detect Archive Engine
def get_archive_engine():
    # Priority: 7-Zip (Native cross-platform powerhouse)
    for cmd in ["7z", "7za"]:
        if shutil.which(cmd):
            return {"type": "7z", "bin": cmd}
    
    # Secondary: WinRAR / UnRAR (Windows/Linux)
    for cmd in ["unrar", "rar", "UnRar.exe", "Rar.exe"]:
        if shutil.which(cmd):
            return {"type": "rar", "bin": cmd}
    
    return None

ENGINE = get_archive_engine()

# Extensions to extract and keep
KEEP_EXTS = {".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb", 
             ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq", 
             ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt"}

# Patterns that indicate a file is a BIOS UTILITY (WE MUST KEEP THESE)
SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"]

# Patterns that are 100% GARBAGE (GOOGLE FLAGS THESE)
GARBAGE_PATTERNS = ["crack", "patch", "keygen", "loader", "bypass", "activator", "lpk.dll", "TVW specific software"]

def clean_zip(zip_path, local_base_dir, exclude_file_path):
    if not ENGINE:
        print("[ERROR] No archive engine (7-Zip/WinRAR) found. Skipping cleanup.")
        return

    zip_path = Path(zip_path)
    base_dir = Path(local_base_dir)
    exclude_file = Path(exclude_file_path)
    
    dir_path = zip_path.parent
    rel_path = zip_path.relative_to(base_dir)
    
    if "bios" in str(rel_path).lower():
        print(f"[SKIP] BIOS archive (protected): {rel_path}")
        return

    print(f"--- Processing: {rel_path} ---")
    
    # 1. Peek inside
    try:
        if ENGINE["type"] == "7z":
            cmd = [ENGINE["bin"], "l", str(zip_path), "-r"]
        else: # rar/unrar
            cmd = [ENGINE["bin"], "v", str(zip_path)]
            
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        internal_listing = result.stdout
    except Exception as e:
        print(f"[ERROR] Could not read archive {rel_path}: {e}")
        return

    has_garbage = any(p.lower() in internal_listing.lower() for p in GARBAGE_PATTERNS)
    has_safe_tools = any(p.lower() in internal_listing.lower() for p in SAFE_PATTERNS)

    if has_garbage and not has_safe_tools:
        print(f"[PURGE] Detected malware/bloat patterns. Rescuing safe data...")
        
        # 2. Extract safe extensions
        for ext in KEEP_EXTS:
            if ENGINE["type"] == "7z":
                # 7z e extracts to a flattend directory
                subprocess.run([ENGINE["bin"], "e", str(zip_path), f"*{ext}", f"-o{dir_path}", "-r", "-y"], 
                               capture_output=True, check=False)
            else: # rar/unrar
                # unrar e -r (recursive) -y (yes to all)
                subprocess.run([ENGINE["bin"], "e", "-r", "-y", str(zip_path), f"*{ext}", str(dir_path)],
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
    if not ENGINE:
        print("[WARNING] Skipping cleanup: No 7-Zip or WinRAR found on system.")
        return
    
    print(f"\n[CLEANUP] Starting sweep with {ENGINE['bin']} in: {target_dir}")
    target_path = Path(target_dir)
    for zip_file in target_path.rglob("*.zip"):
        clean_zip(zip_file, target_dir, exclude_file)
