import shutil
import subprocess
import platform
import sys
import os

class DependencyManager:
    def __init__(self):
        self.os_type = platform.system().lower()

    def check_rclone(self):
        return shutil.which("rclone") is not None

    def check_7z(self):
        return shutil.which("7z") is not None or shutil.which("7za") is not None

    def check_requests(self):
        try:
            import requests
            return True
        except ImportError:
            return False

    def install_rclone(self):
        print(f"Attempting to install rclone for {self.os_type}...")
        try:
            if self.os_type == "linux" or self.os_type == "darwin":
                # Official rclone install script
                cmd = "curl https://rclone.org/install.sh | sudo bash"
                print(f"Executing: {cmd}")
                subprocess.run(cmd, shell=True, check=True)
            elif self.os_type == "windows":
                print("\n[MANUAL ACTION REQUIRED]")
                print("Automatic Windows installation is limited. Please download the rclone executable from:")
                print("https://rclone.org/downloads/")
                print("And ensure 'rclone' is in your system PATH.")
                return False
            return True
        except Exception as e:
            print(f"Installation failed: {e}")
            return False

    def install_requests(self):
        print("Installing 'requests' via pip...")
        try:
            # Use --user to avoid permission issues on most systems
            subprocess.run([sys.executable, "-m", "pip", "install", "requests", "--user"], check=True)
            return True
        except Exception as e:
            print(f"Failed to install requests: {e}")
            return False

    def doctor(self):
        print("\n--- Dependency Check ---")
        rclone_ok = self.check_rclone()
        requests_ok = self.check_requests()
        p7zip_ok = self.check_7z()

        print(f"Rclone Engine:    {'[OK]' if rclone_ok else '[MISSING]'}")
        print(f"7-Zip Engine:     {'[OK]' if p7zip_ok else '[MISSING]'}")
        print(f"Python Requests: {'[OK]' if requests_ok else '[MISSING]'}")

        if not requests_ok:
            if input("Install missing Python 'requests' library? (y/n): ").lower() == 'y':
                self.install_requests()

        if not rclone_ok:
            print("\n[REQUIRED] rclone is needed for synchronization.")
            if input("Attempt to install rclone? (y/n): ").lower() == 'y':
                self.install_rclone()
        
        if not p7zip_ok:
            print("\n[OPTIONAL] 7-zip is required for 'Surgical Malware Cleanup'.")
            print("Please install 7-zip or p7zip manually on your system.")
        
        return self.check_rclone() and self.check_requests()
