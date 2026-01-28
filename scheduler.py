import os
import platform
import subprocess
import sys
from pathlib import Path

class Scheduler:
    def __init__(self, script_path, local_dir):
        self.script_path = Path(script_path).absolute()
        self.local_dir = Path(local_dir).absolute()
        self.os_type = platform.system().lower()

    def install_weekly(self):
        print(f"Installing weekly sync for {self.os_type}...")
        if self.os_type == "linux":
            return self._install_linux()
        elif self.os_type == "windows":
            return self._install_windows()
        elif self.os_type == "darwin":
            return self._install_mac()
        else:
            print(f"Error: OS {self.os_type} not supported for auto-scheduling.")
            return False

    def _install_linux(self):
        # Using systemd user units
        unit_dir = Path.home() / ".config" / "systemd" / "user"
        unit_dir.mkdir(parents=True, exist_ok=True)
        
        service_file = unit_dir / "schem-sync.service"
        timer_file = unit_dir / "schem-sync.timer"
        
        service_content = f"""[Unit]
Description=Schematic Sync Portal Service

[Service]
Type=oneshot
ExecStart={sys.executable} {self.script_path} --sync
WorkingDirectory={self.script_path.parent}
"""
        timer_content = """[Unit]
Description=Weekly Schematic Sync Timer

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
"""
        with open(service_file, "w") as f: f.write(service_content)
        with open(timer_file, "w") as f: f.write(timer_content)
        
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "--user", "enable", "--now", "schem-sync.timer"], check=True)
        print("Linux Systemd timer installed and enabled.")
        return True

    def _install_windows(self):
        # Using Task Scheduler (schtasks)
        task_name = "SchematicSyncPortal"
        # Robustly quote paths for Windows
        python_exe = f'"{sys.executable}"'
        script_arg = f'"{self.script_path}"'
        cmd = f'schtasks /create /tn "{task_name}" /tr "{python_exe} {script_arg} --sync" /sc weekly /d SUN /st 02:00 /f'
        try:
            subprocess.run(cmd, shell=True, check=True)
            print(f"Windows Task '{task_name}' created successfully (Weekly on Sundays at 2:00 AM).")
            return True
        except subprocess.CalledProcessError as e:
            print(f"Error creating Windows task: {e}")
            return False

    def _install_mac(self):
        # Using launchd
        plist_path = Path.home() / "Library" / "LaunchAgents" / "com.birdman.schemsync.plist"
        plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.birdman.schemsync</string>
    <key>ProgramArguments</key>
    <array>
        <string>{sys.executable}</string>
        <string>{self.script_path}</string>
        <string>--sync</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>DayOfWeek</key>
        <integer>0</integer>
        <key>Hour</key>
        <integer>2</integer>
    </dict>
    <key>WorkingDirectory</key>
    <string>{self.script_path.parent}</string>
</dict>
</plist>
"""
        with open(plist_path, "w") as f: f.write(plist_content)
        subprocess.run(["launchctl", "load", str(plist_path)], check=True)
        print("Mac LaunchAgent installed and loaded.")
        return True
