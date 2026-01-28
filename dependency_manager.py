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

    def check_archive_engine(self):
        for cmd in ["7z", "7za", "unrar", "rar", "UnRar.exe", "Rar.exe"]:
            if shutil.which(cmd):
                return True
        return False

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
        archive_ok = self.check_archive_engine()

        print(f"Rclone Engine:    {'[OK]' if rclone_ok else '[MISSING]'}")
        print(f"Archive Engine:   {'[OK]' if archive_ok else '[MISSING] (7-Zip or WinRAR)'}")
        print(f"Python Requests:  {'[OK]' if requests_ok else '[MISSING]'}")

        if not requests_ok:
            if input("Install missing Python 'requests' library? (y/n): ").lower() == 'y':
                self.install_requests()

        if not rclone_ok:
            print("\n[REQUIRED] rclone is needed for synchronization.")
            if input("Attempt to install rclone? (y/n): ").lower() == 'y':
                self.install_rclone()
        
        if not archive_ok:
            print("\n[OPTIONAL] 7-Zip or WinRAR is required for 'Surgical Malware Cleanup'.")
            print("Please ensure one of these is installed and in your PATH.")
        
        return self.check_rclone() and self.check_requests()
