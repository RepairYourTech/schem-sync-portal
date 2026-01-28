# Universal Schematic Sync Portal 🌐📦

A cross-platform (Windows, Mac, Linux) utility to synchronize massive schematic archives from a remote `copyparty` server with **zero manual configuration**.

## Features
- **Auto-Auth**: Programmatically extracts session cookies from login credentials—no more editing `rclone.conf`.
- **Dependency Doctor**: Automatically checks for and installs `rclone` and the required Python libraries.
- **Cross-Platform Scheduling**: Native background sync for Windows (Task Scheduler), macOS (launchd), and Linux (systemd).
- **Surgical Malware Cleanup**: Optional automatic purging of known malware signatures and bloat from downloaded archives.
- **Robust Sync**: Parallel transfers, retries, and high-speed metadata checks.
- **Manifest Ready**: Built-in support for friend-provided manifest optimizations.

## Getting Started

1. **Download & Run**:
   ```bash
   git clone https://github.com/RepairYourTech/schem-sync-portal.git
   cd schem-sync-portal
   python sync_portal.py --setup
   ```
2. **Follow the Prompts**: The script will check your system for `rclone`, offer to install missing pieces, and ask for your credentials.
3. **Set it & Forget it**: Choose the **Weekly Auto-Sync** option during setup to stay updated automatically.

## Requirements
- `python3` (Standard)
- All other dependencies (`rclone`, `requests`) are handled automatically by the setup wizard.
