# Universal Schematic Sync Portal 🌐📦

A cross-platform (Windows, Mac, Linux) utility to synchronize massive schematic archives from a remote `copyparty` server.

## Features
- **Auto-Auth**: Programmatically extracts session cookies from login credentials.
- **Turbo Sync**: Pre-configured high-parallelism `rclone` engine.
- **Manifest Support**: Ready for server-side manifest optimizations.
- **One-Click Scheduling**: Automatically installs system-native timers (Windows Task Scheduler, Linux Systemd, Mac Launchd).

## Setup
1. Install Python 3 and Rclone.
2. Run the setup wizard:
   ```bash
   python sync_portal.py --setup
   ```
3. Perform a manual sync:
   ```bash
   python sync_portal.py --sync
   ```

## Requirements
- `python3`
- `requests` (Install via `pip install requests`)
- `rclone` (Must be in system PATH)
