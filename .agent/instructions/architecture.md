# Architecture

## Three-Phase Sync Engine

The sync engine operates in three distinct phases (see `src/lib/sync.ts`):

### 1. Pull Phase
Downloads from source provider to staging directory:
- Analyzes manifests for optimization
- Downloads missing files with progress tracking
- Tracks `FileTransferItem` objects in `downloadQueue`

### 2. Clean Phase
Malware shield scans and sanitizes:
- Scans downloaded archives for risky patterns
- Purges or isolates malicious files
- Tracks `CleanupStats` with scanned/flagged counts

### 3. Cloud Phase
Uploads to backup provider:
- Syncs cleaned archives to cloud backup
- Tracks upload progress via `uploadQueue`
- Reports `CloudSyncStats` (new/updated/deleted files)

## Component Hierarchy

Main application flow through views (see `src/index.tsx`):

- **Splash** - Initial loading and font installation check
- **Wizard** - First-time setup for source/backup providers
- **Dashboard** - Main menu with sync status
- **SyncPortal** - Active sync operation view (3 panels: downsync, shield, upsync)
- **Options** - Configuration management
- **Doctor** - Diagnostic tools
- **ForensicView** - Malware shield audit log viewer

## Rclone Isolation Pattern

- Rclone operations are wrapped in `src/lib/rclone.ts`
- Use `--use-json-log` flag for structured, parseable output
- Never parse `rclone.conf` directly - use `rclone config` commands
- All subprocess management uses Bun's `spawn`/`spawnSync`

## Directory Structure

```
src/
├── components/       # UI components (React TUI)
│   ├── Dashboard.tsx
│   ├── Wizard.tsx
│   ├── SyncPortal.tsx
│   ├── Options.tsx
│   ├── Hotkey.tsx
│   ├── FontInstaller.tsx
│   ├── FontMissingBanner.tsx
│   ├── SlimeIcon.tsx
│   ├── FlexBVIcon.tsx
│   ├── FlexBVRealIcon.tsx
│   ├── Splash.tsx
│   ├── ForensicView.tsx
│   └── SyncPortalParts.tsx
├── lib/              # Business logic, rclone wrappers, sync engine
│   ├── sync.ts       # Three-phase sync engine
│   ├── rclone.ts     # Rclone CLI wrapper
│   ├── cleanup.ts    # Malware shield logic
│   ├── config.ts     # Configuration types
│   ├── env.ts        # Environment handling
│   └── logger.ts     # Logging utilities
├── tests/            # Comprehensive Bun test suite
│   ├── cleanup.test.ts
│   ├── mock_rclone.ts
│   └── sync_visibility.test.ts
└── index.tsx         # Main entry point

.agent/               # Agent documentation and instructions
├── instructions/
│   ├── workflow.md
│   ├── tech-stack.md
│   ├── patterns.md
│   ├── structure.md
│   ├── commands.md
│   ├── architecture.md
│   └── ui-pattern-verifier.md
└── skills/           # Reusable agent skills

scripts/              # Maintenance scripts (e.g., linting)
assets/               # Bundled fonts and static resources
memory/               # Multi-memory store for self-improving-agent
                      # (Semantic, Episodic, Working)
```
