# 🦅 Schematic Sync Portal

> **The Zero-Terminal, Multi-Cloud Solution for Secure Schematic Management.**

The **Schematic Sync Portal** is a high-security TUI (Terminal User Interface) application designed to bridge your local schematic archives with the cloud *without* exposing your main OS credentials or mixing environments.

It supports **8+ Cloud Providers** in a completely isolated environment, ensuring your sensitive boardviews and PDFs are safe, synced, and separated from your personal data.

## 🚀 Features

### ☁️ Multi-Cloud Sovereign Containers
Choose your backend. The Portal creates a dedicated, isolated remote for:
*   **Google Drive** (Project-Isolated w/ Guided Setup)
*   **Backblaze B2** ($6/TB Pro Storage)
*   **pCloud** (Swiss Privacy)
*   **SFTP / Private Server** (Self-Hosted/NAS)
*   **OneDrive** (Corporate/O365)
*   **Dropbox** (Classic Sync)
*   **Mega.nz** (Encrypted/Free Tier)
*   **Cloudflare R2** (Zero Egress Fees)

### 🛡️ Security First
*   **Surgical Isolation**: Creates dedicated remotes that never touch your system's global `rclone.conf` `[drive]` configuration.
*   **Zero-Terminal Handshake**: Handles OAuth and token exchanges interactively within the UI—no manual config editing required.
*   **Rclone CLI Backend**: Leverages the industry-standard `rclone` binary for robust, obfuscated credential management.
*   **Malware Policy**: Optional "Surgical Purge" or "Isolate" modes for handling questionable files often found in schematic dumps.

### 🖥️ Native Experience
*   **TUI Wizard**: A beautiful, mouse-supported terminal interface.
*   **Desktop Integration**: Auto-creates `.desktop` entries or Start Menu shortcuts.
*   **Input-Lag Free**: Optimized input handling for rapid navigation.

## 📦 Installation & Usage

**Prerequisites:** `bun` (Runtime) and `rclone` (Backend).

```bash
# 1. Install Dependencies
bun install

# 2. Run the Portal
bun dev
```

The First-Run Wizard will guide you through:
1.  **shortcut integration**: Adding the app to your system menu.
2.  **Source Config**: Setting your schematic source URL.
3.  **Cloud Provider Selection**: Choosing and authenticating your preferred cloud provider.

## 🔧 Architecture

*   **Frontend**: React TUI (Ink/OpenTUI)
*   **Backend**: Bun + Rclone CLI Wrapper
*   **State**: `~/.config/schem-sync-portal/config.json`
*   **Logs**: `./logs/auth_debug.log`

## ⚠️ Safe Mode (Reset)

If you need to nuke the Portal's configuration without touching your other system backups:
1.  Launch the app.
2.  Hold `ESC` on the dashboard to access the reset menu.
3.  Select **Portal Only** reset.

---
*Built for the Repair community, keep Right to Repair alive and thriving. 🦅*
