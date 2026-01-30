# PRD: Sync UI & Architecture Overhaul

## 1. Core Philosophy (The "Why")
The **primary mission** is to maintain a local mirror of a schematic library ("Downsync").
*   **Core:** Incremental Downsync to local disk.
*   **Bonus (Optional):** Upsync to a private cloud backup.
*   **Protection (Conditional):** Malware Shield (False-flag removal) - **ONLY** relevant if Upsync is active.

## 2. Configuration Hierarchy (Wizard)

### Step 1: Source Configuration (MANDATORY)
*   **Question:** "Where are you pulling schematics FROM?"
*   **Default:** Official CopyParty Server (Recommended).
*   **Advanced:** Custom Provider (using the 8-provider integrated logic).
*   **Result:** Application is now a Functional Downloader.

### Step 2: Backup Configuration (OPTIONAL)
*   **Question:** "Do you want to enable Cloud Backup (Upsync)?"
*   **Choice:** Yes / No.
*   **If NO:** Configuration Complete. User gets a 1-Pane UI.
*   **If YES:**
    *   User selects Backup Provider (Project B).
    *   **Sub-Question (ONLY here):** "Enable Malware Shield?"
        *   *Context:* "Prevents false-positive flags (keygens/cracks) from suspending your cloud account."
    *   **Result:** Application is now a Sync Portal (2-Pane or 3-Pane).

## 3. UI Layout & Logic

The UI layout adapts dynamically to the configuration.

### Scenario A: Pure Downloader (Most Users)
*   **Layout:** Single Pane (Left).
*   **Label:** `DOWN: [Source Name]`
*   **Logic:** Pulls files from remote -> Local Disk.

### Scenario B: Downloader + Backup (No Shield)
*   **Layout:** Two Panes (Left & Right).
*   **Flow:** `[ DOWN ]` -> Local Disk -> `[ UP ]`.
*   **Logic:** All local files are mirrored to the backup cloud.

### Scenario C: The Full Fortified Pipeline
*   **Layout:** Three Panes (Left, Middle, Right).
*   **Flow:** `[ DOWN ]` -> Local Disk -> `[ SHIELD ]` -> `[ UP ]`.
*   **Critical Gate:**
    *   The Upsync process monitors the *Shield's* output, NOT the raw disk.
    *   Only files explicitly cleared/cleaned by the Shield are eligible for upload.
    *   This protects the cloud account from "dirty" files while keeping the local copy intact (or cleaned, per policy).

## 4. Technical Architecture Updates

### 4.1 `PortalConfig` Schema
```typescript
interface PortalConfig {
    // ...
    mode: "download_only" | "sync_backup";
    
    // Source (Downsync)
    download_source_type: "copyparty" | "cloud";
    download_config: ProviderCredentials; // Generic container
    
    // Destination (Upsync) - Only valid if mode === 'sync_backup'
    upload_dest_type?: "cloud";
    upload_config?: ProviderCredentials;
    
    // Shield - Only valid if mode === 'sync_backup'
    enable_malware_shield?: boolean; // Defaults to FALSE
}
```

### 4.2 Sync Engine (`useSync.ts`)
Must be decoupled into independent "Runners":
*   `Downloader`: Always runs.
*   `Scanner`: Runs only if `enable_malware_shield`. Watches Local Dir.
*   `Uploader`: Runs only if `mode === 'sync_backup'`. Watches Local Dir (or Scanner Output).

## 5. Approval Checklist
- [ ] **Data Model:** Update `PortalConfig` to reflect the dependency chain (Shield depends on Upsync).
- [ ] **Wizard:** Refactor flow to make Upsync optional and introduce the Source Selection step.
- [ ] **Engine:** Implement the "Runner" pattern for concurrent, gated operations.
- [ ] **UI:** Build the dynamic 1, 2, or 3-pane layout component.
