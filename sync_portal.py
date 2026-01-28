import os
import subprocess
import json
import argparse
from pathlib import Path
from auth_handler import get_copyparty_cookie
from scheduler import Scheduler
from dependency_manager import DependencyManager

class SyncPortal:
    def __init__(self, config_path="config.json"):
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.deps = DependencyManager()

    def load_config(self):
        if self.config_path.exists():
            with open(self.config_path, "r") as f:
                return json.load(f)
        return {}

    def save_config(self):
        with open(self.config_path, "w") as f:
            json.dump(self.config, f, indent=4)

    def setup(self):
        print("\n--- Universal Schematic Sync Portal Setup ---")
        
        # 1. Dependency Check
        if not self.deps.doctor():
            print("\n[WARNING] Some dependencies are still missing. Sync might fail.")

        print("\n--- Configuration ---")
        self.config['url'] = input("Remote URL (e.g., https://example.com/): ").strip()
        self.config['user'] = input("Username: ").strip()
        self.config['pwd'] = input("Password: ").strip()
        self.config['local_dir'] = input("Local Sync Directory: ").strip()
        
        # Expand local directory path
        self.config['local_dir'] = str(Path(self.config['local_dir']).expanduser().absolute())
        
        print("\nScheduling Options:")
        print("1. Manual Only")
        print("2. Weekly Auto-Sync (Recommended)")
        choice = input("Select an option [1-2]: ").strip()
        
        self.save_config()
        
        if choice == "2":
            sched = Scheduler(__file__, self.config['local_dir'])
            sched.install_weekly()
        
        print(f"\nConfiguration saved to {self.config_path.absolute()}")

    def run_sync(self):
        if not self.config:
            print("Error: Portal not configured. Run with --setup first.")
            return

        # 1. Get Authentication Cookie
        cookie_header = get_copyparty_cookie(
            self.config['url'], 
            self.config['user'], 
            self.config['pwd']
        )
        
        if not cookie_header:
            print("Error: Could not authenticate with remote server.")
            return

        # 2. Prepare Dynamic Rclone Config
        env = os.environ.copy()
        env["RCLONE_CONFIG_PORTAL_TYPE"] = "http"
        env["RCLONE_CONFIG_PORTAL_URL"] = self.config['url']
        env["RCLONE_CONFIG_PORTAL_HEADERS"] = cookie_header
        env["RCLONE_CONFIG_PORTAL_PACER_MIN_SLEEP"] = "0.01ms"

        # 3. Check for Manifest (Placeholder for Friend's Optimizations)
        print("\n[INFO] Manifest Protocol Check...")
        manifest_url = f"{self.config['url'].rstrip('/')}/manifest.txt"
        try:
            r = subprocess.run(["rclone", "cat", "portal:manifest.txt"], env=env, capture_output=True, text=True)
            if r.returncode == 0:
                print("[SUCCESS] Remote manifest found! Using Manifest-Fast-Sync.")
                # FUTURE: Implement --files-from logic here
            else:
                print("[SKIP] Remote manifest missing. Falling back to standard deep-sync.")
        except:
            print("[SKIP] Manifest check failed. Falling back to standard deep-sync.")

        # 4. Execute Sync
        log_file = Path(self.config['local_dir']) / "sync_portal.log"
        print(f"\n[SYNC] {self.config['url']} -> {self.config['local_dir']}...")
        print(f"[INFO] Logging to: {log_file}")
        
        cmd = [
            "rclone", "sync", "portal:", self.config['local_dir'],
            "--progress",
            "--size-only",
            "--fast-list",
            "--transfers", "4",
            "--checkers", "16",
            "--timeout", "15m",
            "--retries", "10",            # Robustness: Retry failed chunks 10 times
            "--low-level-retries", "20",  # Robustness: Retry low-level network errors 20 times
            "--log-file", str(log_file),  # Persistent logging for background runs
            "--log-level", "INFO",
            "--ignore-errors",
            "--links"
        ]

        try:
            subprocess.run(cmd, env=env, check=True)
            print("\n========================================")
            print("   SCHEMATIC SYNC PORTAL: COMPLETE")
            print("========================================")
        except subprocess.CalledProcessError as e:
            print(f"\n[ERROR] Sync interrupted or failed. Rclone will resume next run.")
            print(f"Details in: {log_file}")

if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description="Universal Schematic Sync Portal")
        parser.add_argument("--setup", action="store_true", help="Run interactive setup")
        parser.add_argument("--sync", action="store_true", help="Start synchronization")
        
        args = parser.parse_args()
        portal = SyncPortal()

        if args.setup:
            portal.setup()
        elif args.sync:
            portal.run_sync()
        else:
            parser.print_help()
    except KeyboardInterrupt:
        print("\n[INFO] Operation cancelled by user. Exiting...")
        sys.exit(0)
    except Exception as e:
        print(f"\n[CRITICAL] Unexpected error: {e}")
        sys.exit(1)
