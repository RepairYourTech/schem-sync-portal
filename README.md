# Universal Schematic Sync Portal 🌐📦

A cross-platform (Windows, Mac, Linux) utility to synchronize massive schematic archives from a remote `copyparty` server with **zero manual configuration**.

## Features
- **Auto-Auth**: Programmatically extracts session cookies from login credentials—no more editing `rclone.conf`.
- **Dependency Doctor**: Automatically checks for and installs `rclone` and the required Python libraries.
- **Cross-Platform Scheduling**: Native background sync for Windows (Task Scheduler), macOS (launchd), and Linux (systemd).
- **Surgical Malware Cleanup**: Optional automatic purging of known malware signatures and bloat from downloaded archives (If GDrive is flagging any uploads).
- **Robust Sync**: Parallel transfers, retries, and high-speed metadata checks.
- **Manifest Ready**: Built-in support for friend-provided manifest optimizations.
- **Cloud Backup Option**: Optional secondary sync to Google Drive to keep your data safe in the cloud.

## Getting Started

To install dependencies:

```bash
bun install
```

To run:

```bash
bun dev
```

This project was created using `bun create tui`. [create-tui](https://git.new/create-tui) is the easiest way to get started with OpenTUI.

## Cloud Storage Strategy (The "Life Hack")
Storing 180GB+ of schematics on Google Drive for free is impossible (15GB limit), but you can manage it strategically:

### 1. Cost Optimization
* **The Plan**: Subscribe to the **Google One 2TB plan** for ~$10/month.
* **The Hack**: If you don't want to pay every month, Google will retain your data for **2 years** after a subscription lapses. You can pay for 1 month to "refresh" the timer and perform a massive up-sync, then cancel. Your data stays safe and readable.

### 2. Safety First (Dedicated Account)
> [!IMPORTANT]
> **Use an alternate Google Account** (not your primary email/contacts/photos).
> When you are over-quota (after a sub lapses), you **cannot send or receive emails** or upload new files. Keeping this on a separate "Storage Only" account ensures your primary communication is never interrupted.

## Requirements
- `python3` (Standard)
- All other dependencies (`rclone`, `requests`) are handled automatically by the setup wizard.
