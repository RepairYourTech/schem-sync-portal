# Schematic Sync Portal — Verified Audit (Second Pass)

Scope: four independent auditors read the working tree (uncommitted changes included) on
branch `feat/ntfy-auto-sync`. Every finding below carries a `file:line` reference and was
verified against the actual code, not inferred. Where the first-pass audit
(`audit-findings.md`, written by GPT) made a claim, this document records CONFIRMED /
REFUTED / PARTIAL.

Baseline health at audit time: `tsc --noEmit` passed, `bun test` passed (207/207), lint
passed. Every defect below was invisible to that toolchain — which is itself the finding.

## Status

Tiers 0–4 have been remediated. Current state: 234 tests pass, typecheck and lint clean.
Line references point at the code **as it was when audited**; several files have since
been split (`src/lib/shield/archiveEngine.ts`, `src/lib/shield/fileCleaner.ts`,
`src/components/wizard/wizardOptions.ts`, `src/lib/layout.ts`).

Known remaining gaps, deliberately not fixed:

- **Secrets in argv** (S3). `rclone config create` and `rclone authorize` take credentials
  as positional arguments, visible in `ps` to other local users. Fixing this means moving
  to `RCLONE_CONFIG_*` environment variables, which is a rework of remote creation.
- **Password fields echo on screen** (S5). OpenTUI's `InputRenderable` has no mask option;
  masking requires custom bullet rendering with manual cursor/backspace handling.
- **Zip-slip** (D10) is still delegated to the extractor's own sanitisation.
- **`findNextStep` resume checks** (W15/W18) remain dead: `strict_mirror` and
  `upsync_enabled` default to `false` rather than `undefined`, so a config abandoned
  mid-wizard resumes at Deploy. The defaults are safe (no mirror deletion, no upload),
  so this is a UX gap, not a data-loss one.
- **Step numbers** (`history.length + 1`) still misreport after Back/menu round-trips.
- **Escape/hotkey semantics** still differ per screen (K6).
- **Sync-view panel heights** (K8) are improved by the shared footer constant, but three
  stacked panels still need more rows than an 80x24 terminal provides.

Remote deletion in `runForensicSweep` is now **off by default**: it requires an explicit
`scrubRemote: true`, and no caller passes it. Wiring a confirmation prompt is outstanding.

---

## Verdicts on the first-pass audit

| GPT claim | Verdict | Note |
|---|---|---|
| 1. Can destroy the wrong directory | **CONFIRMED** | Understated — missed `--ignore-errors` |
| 2. Cleanup deletes on failed extraction | **CONFIRMED** | `archiveAnalyzer.ts` citation is dead code; real defects are in `cleanup.ts` |
| 3. Shield is heuristic filename filtering | **CONFIRMED** | Accurate; product-claim mismatch |
| 4. Secret handling unsafe | **CONFIRMED** | Missed argv exposure, masker blind spot, ntfy topic |
| 5. Sync reporting too optimistic | **CONFIRMED** | Interactive pull path is honest; daemon + cloud phase lie |
| 6. Keyboard/focus brittle | **CONFIRMED** | Examples were invented (`q`/`s` bindings don't exist); defect class is real and worse |
| 7. Layout not robust | **CONFIRMED** | App *does* measure terminal size; adaptation is width-only |
| 8. Persistence/install fragile | **CONFIRMED** | See P1 (autosave) |

GPT cited `src/lib/useSync.ts` (wrong path — it is `src/hooks/useSync.ts`) and
`src/components/wizard/steps/DirectoryConfig.tsx` (wrong path — `wizard/DirectoryConfig.tsx`).
Its `archiveAnalyzer.ts` citation points at a function no production code calls.

---

## Tier 0 — Data-loss risks. Do not ship.

**D1. `rclone sync` runs with `--ignore-errors` against an unvalidated path.**
`src/lib/sync/utils.ts:105` → `src/lib/sync/pullPhase.ts:226`
`sync` deletes destination files absent from the source; `--ignore-errors` disables rclone's
built-in refusal to delete when the source listing had I/O errors. With `strict_mirror: true`,
a flaky connection mid-sync deletes local files. In no-manifest discovery mode
(`pullPhase.ts:337-349`) this is a bare recursive sync of the whole directory.

**D2. Archives are deleted after an extraction whose exit code is never checked.**
`src/lib/cleanup.ts:253` (`getSpawnSync()(extractCmd)` — return value discarded),
errors swallowed at `:294-296`, staging wiped at `:297`, then `unlinkSync(archivePath)` at
`:305-306` runs even when `extractedCount === 0`. The archive is then added to the exclude
ledger (`:308`), so it is **never re-downloaded**. A password-protected, truncated, or
disk-full archive is permanently destroyed.

**D3. `purge` policy (the default) deletes clean archives with zero extraction verification.**
`src/lib/cleanup.ts:362-367`. Extracted-file count is never compared against archive contents.
Same permanent-loss shape as D2.

**D4. `Env.isSafeDirectory()` is dead code.**
Defined `src/lib/env.ts:120-132`, **zero call sites** repo-wide. The only gates on `local_dir`
are non-empty checks (`WizardContainer.tsx:275`, `sync/index.ts:64`, `config.ts:177`). Nothing
blocks `/`, `$HOME`, or an existing data directory. (It would not block `/home` even if wired.)

**D5. Lean mode purges every file whose extension isn't whitelisted.**
`src/lib/cleanup.ts:394-397` + `:421`. `isGarbage` is true for any `.jpg`, `.docx`, `.xlsx`,
`.mp4`. The standalone sweep globs `**/*` of `targetDir` → `unlinkSync`. Combined with D4:
point `local_dir` at a folder holding personal files, pick Lean, lose everything outside the
~15-extension whitelist. No confirmation.

**D6. Local heuristic deletions escalate to remote `rclone delete` on Google Drive.**
`src/lib/cleanup.ts:426` records every lean-purged file as an "offender";
`src/lib/forensics.ts:73` then runs `rclone delete <gdriveRemote>:<file> --ignore-errors` per
offender against the remote root. False positive locally → file deleted from a possibly-shared
Drive. Also spawns raw `"rclone"` without `--config` or the `MOCK_RCLONE` test shim,
bypassing the safety guard at `env.ts:96-105`.

**D7. Extracted files never enter the exclude ledger → strict-mirror deletes them next run.**
`ShieldManager.updateExclusions` is called with archive and purged paths only
(`cleanup.ts:308, 336, 365, 427`), never with kept extracted files (`:274-289`). Run 1 extracts
and excludes the archive; run 2's `rclone sync` deletes the extracted files as "not on remote".
Content then exists neither locally nor as a re-downloadable archive.

**D8. An archive containing `Error Codes.pdf` is condemned to deletion.**
`src/lib/cleanup.ts:184-204` + `:348-351`. `isValidListing` returns false if the listing merely
*contains* the substring `"error"` / `"failed"` / `"invalid"` → `failSafeTriggered` → `hasGarbage`
→ `unlinkSync(archivePath)` under purge policy.

**D9. Name collisions silently discard extracted content while the archive is still deleted.**
`src/lib/cleanup.ts:274` — `if (!existsSync(destPath))` guard drops the file; staging is wiped;
the archive deletion in D2/D3 proceeds. A newer revision inside the archive is lost, unlogged.

**D10. Zip-slip is delegated entirely to the extractor.** `cleanup.ts:253, 330`. No in-app entry
name validation. Older `unrar` (CVE-2022-30333 class) would let a malicious remote archive
write outside staging. Spawn uses arg arrays, so no shell interpolation — this is the lesser risk.

---

## Tier 1 — Security

**S1. Every credential the app handles is dumped raw to stdout.**
`src/lib/rclone.ts:57` — `console.log("DEBUG_RCLONE_ARGS:", JSON.stringify(finalArgs))`.
Leftover debug line inside `createRcloneRemote()`, the funnel for **all** providers: WebDAV
passwords, CopyParty session cookies, S3/R2 secret keys, B2 keys, Google client secret and the
full OAuth token JSON. Unconditional (not debug-gated) and uses `console.log`, so
`Logger.maskSensitive` never runs. **One-line fix; do this first.**

**S2. A live CopyParty session cookie is on disk right now.**
`src/lib/auth.ts:39` logs captured cookies at DEBUG. The masker (`logger.ts:208-220`) only
matches `key=value` shapes for the word `cookie`; the payload is `cppws=<token>`, which matches
nothing. `logs/auth_debug.log:16` contains a real cookie for `xzzcopyparty.slimeinacloak.com`,
valid to 2027, file mode `-rw-r--r--`. Gitignored, so it never left the machine.
**Action: invalidate that session.**

**S3. Secrets passed as argv, visible in `ps` / `/proc/*/cmdline`.**
`src/lib/rclone.ts:60` and `:217`. `rclone authorize drive <clientId> <clientSecret>` lives for
the whole OAuth browser dance. rclone supports `RCLONE_CONFIG_*` env vars and stdin config
precisely to avoid this.

**S4. The ntfy topic is an unauthenticated remote trigger — and it's logged.**
`src/components/AppContent.tsx:91-99` and `src/lib/ntfy-worker.ts:27-47` start a sync on **any**
message on the topic; content is never validated (`ntfy.ts:89-91` forwards every `message` event).
The topic URL — the only credential for a public ntfy server — is logged at INFO
(`ntfy.ts:126`) and stored plaintext in `config.json` (mode 644). Anyone who learns or guesses
the topic can trigger syncs on the machine; with `strict_mirror: true` a triggered sync is one
that deletes local files (see D1). **This is the feature this branch adds.**

**S5. Password fields echo in plaintext on screen and stay rendered.**
`CloudDirectEntryStep.tsx:110-123`, `CopypartyConfigStep.tsx:64-74`. OpenTUI's
`InputRenderable` has no mask option (verified in `@opentui/core` types), so masking needs
manual bullet rendering; none exists.

**S6. Log masker has a JSON blind spot.** `src/lib/logger.ts:212-217` requires `:`/`=` directly
after the keyword, so `"access_token": "ya29..."` never matches. `rclone.ts:309-310` pipes raw
rclone output through it at NORMAL level.

**S7. Minor leaks.** `auth.ts:12` logs URL + username + password length.
`src/hooks/useWizardAuth.ts:88` console.logs the first 10 chars of the Google client ID.

**REFUTED:** no secrets are committed to git. `config.json` is gitignored and untracked; tracked
`*.conf.test` files are empty. `~/.config/rclone/rclone.conf` is mode 600 and rclone auto-obscures
password fields. (Note: the untracked `test_sync_fail_*` dirs are **not** gitignored — only
`test_sync_flow_*` is — so they are a junk-commit risk. They come from
`src/tests/e2e/sync-flow.test.tsx:100`, which writes into `process.cwd()` and doesn't clean up.)

---

## Tier 2 — The app lies about success

**R1. The daemon reports success on every failure.**
`src/lib/ntfy-worker.ts:38-43` logs `"Sync completed successfully."` unconditionally, because
`runSync` **never throws** — `sync/index.ts:279-296` converts every error into an
`onProgress({phase:"error"})` callback and returns normally. The worker's `catch` is dead code.
No failure exit code, so systemd's `Restart=on-failure` (`daemon.ts:52`) can never fire.
Headless failures are completely silent.

**R2. Cloud upload failures are swallowed in the polling loop.**
`src/lib/sync/cloudPhase.ts:163-169`. A failed batch upload is logged, loop continues → infinite
silent retry showing "Monitoring manifest for updates…". The final manifest re-read's catch
(`:184`) falls straight into the completion block. **A run that uploaded 0 of 10,000 files still
ends "MISSION ACCOMPLISHED".**

**R3. "Backup complete" is printed after any loop exit, including user stop.**
`src/lib/sync/cloudPhase.ts:200-203`. Every stop-requested `break` (`:83, 118, 129, 135, 190`)
lands here, marking `upsyncStatus: "complete"`.

**R4. No stop check before declaring victory; success stats are hardcoded.**
`src/lib/sync/index.ts:245-250, 257-277`. `runPullPhase` returns cleanly on stop. Press Stop
between rclone subprocesses → `"MISSION ACCOMPLISHED. SYSTEM RESILIENT."`, `clearSyncState()`
destroys the resume checkpoint, and `status: "success" as const` is persisted. Whether you get
the honest "Sync stopped by user" path is a race on whether the stop killed an in-flight rclone.
The error path (`:288-295`) never writes `last_sync_stats`, so `config.json` and the Dashboard
permanently display the last success.

**R5. Shield failures don't fail the run, and unscanned files are approved for upload.**
`sync/index.ts:198` discards `runCleanupSweep`'s return value — but `cleanup.ts:81-84, 159-162`
signal failure by *returning* `{completed:false}`, not throwing. `pullPhase.ts:429-431` swallows
final-sweep errors. Then `pullPhase.ts:439-445` builds the upsync manifest from a full directory
scan, so files the shield never scanned are marked approved and uploaded.

**PARTIAL:** the interactive pull path is honest — `SyncPortal.tsx:75/97` renders `❌ ERROR` for
`phase === "error"`. The lie is confined to the cloud phase, stop races, and the daemon.
`src/hooks/useSync.ts:31-47` has a dead catch and clears the session after internal errors,
so a failed run can't be resumed.

---

## Tier 3 — Why the setup menus feel like chaos

The root cause is structural, and it explains the "I fixed it but nothing changed" experience:

> **Step UIs and the container's `getOptions()` maintain two independent copies of every option
> list.** Mouse clicks read the UI's list; keyboard Enter reads the container's list. They have
> drifted. Additionally, four step components are dead code that is still being edited.

**W1. The edit menu activates the wrong item for 6 of 9 entries.**
`EditMenuStep.tsx:15-24` renders `[shortcut, source_choice, dir, mirror, upsync_ask, security,
ntfy_config, deploy]`. `WizardContainer.tsx:214` maps Enter against `[shortcut, download_mode,
source_choice, dir, mirror, upsync_ask, security, deploy, back]`. Same length, different contents
from index 1. Arrow to "SOURCE PROVIDER", Enter → Download Strategy opens. Select "NOTIFICATIONS"
→ Security Policy opens. The displayed `[0]` hotkey for DEPLOY does nothing (handler accepts
`1`–`9`, `:424`).

**W2. Typing a path navigates.** `WizardContainer.tsx:417-429` runs on every keypress with no
focus guard. OpenTUI dispatches global `useKeyboard` handlers **before** the focused input
(verified in `@opentui/core` `emitWithPriority`), and nothing calls `stopPropagation()`. Typing
`/backups` → the `b` fires `back()` **twice** (`AppContent.tsx:169` and `WizardContainer.tsx:428`
both fire) and ejects you two screens mid-word. Digits hijack `selectedIndex`. Enter on the
focused input calls `confirmSelection` with `type:"dir_input"`, which falls to the untyped
else-branch (`:297-303`) and calls `next()` — **bypassing the empty-path guard**, so an empty
`local_dir` reaches `mirror` and is autosaved.

**W3. "DISCARD — Exit without saving" is a lie.** `AppContent.tsx:319-321` wires
`updateConfig` → `saveConfig()` on every keystroke and every option pick. There is no
uncommitted wizard state. Quitting mid-wizard persists partial config (a half-typed `/hom`),
which the sync engine will use.

**W4. Every non-GDrive guide step is a keyboard dead end.** `WizardContainer.tsx:417`'s
`selectableSteps` includes `gdrive_guide_1..4` but omits `b2_guide_*`, `sftp_guide_1`,
`pcloud_guide_1`, `onedrive_guide_*`, `dropbox_guide_*`, `mega_guide_1`, `r2_guide_*`,
`s3_guide_*`. No key does anything — the footer still says "[B]ack to return". Mouse-only escape.

**W5. CopyParty: Enter on the highlighted "TEST & CONNECT" goes back and wipes inputs.**
`WizardContainer.tsx:392-396` maps index 4 → `back()`, index 3 → `handleAuth()`. The UI
(`CopypartyConfigStep.tsx`) is 0=URL, 1=user, 2=pass, 3=method radio, 4=TEST & CONNECT, 5=Back.
The map predates the method row. Re-entry runs `resetWizardRefs()`, erasing everything typed.
The Back button (5) is keyboard-unreachable (capped at 4, `:360`).

**W6. S3 direct entry collects zero credentials but "succeeds".**
`CloudDirectEntryStep.tsx:32-54` has no `s3` branch → no fields render.
`providerHandlers.ts:88-98` writes `access_key_id: ""`, `secret_access_key: ""` into rclone,
`createRcloneRemote` swallows the error (`rclone.ts:73-75`), and `next()` is called. The user is
congratulated; the first upsync fails opaquely.

**W7. Security step: phantom option, and number keys select a different row than labeled.**
`SecurityStep.tsx:19-24` renders 4 options; `WizardContainer.tsx:220-223` produces 3 + back.
`allOptions.findIndex(...)` returns −1 for `"extract"`, so it never shows focus and is
mouse-only. Pressing `3` highlights the row labeled `[4] DISABLED`.

**W8. The ntfy step is unreachable in first-run flow and has no forward path.**
Nothing routes *to* `ntfy_config`; its `next()` case (`:163`) is dead code; it appears only in
EditMenuStep's mouse list. Inside, there is no Next/Done — only Back, and because the menu jump
pushed no history, Back = `onCancel()` = ejects from the wizard entirely. Changes survive only
because of the autosave bug (W3).

**W9. Keyboard-toggling the ntfy daemon sets the flag without installing the daemon.**
`WizardContainer.tsx:372-375` writes `ntfy_daemon_enabled` directly; the mouse path
(`NtfyConfigStep.tsx:75-94`) calls `installDaemon()`. `AppContent.tsx:80-87` then shuts down the
in-app listener because "the daemon owns it" — but no daemon exists. Notifications go silently
dead. The "TEST CONNECTION" button, whose hotkey label is literally `ENTER`, never responds to
Enter (`:387-391`).

**W10. Typing the ntfy URL live-connects to every partial URL.** Autosave (W3) +
`AppContent.tsx:111`'s effect on `config.ntfy_url` → typing `https://ntfy.sh/mytopic` tears down
and reconnects ~25 times against `https://n`, `https://nt`, …

**W11. Provider marked configured before auth.** `confirmSelection:278-290` persists
`source_provider` at selection time. Quit at the intro → `findNextStep`
(`wizard-utils.ts:29`) sees it configured and resumes at `dir`. Sync later fails with
"remote portal_source not found" and the wizard never routes back through auth.

**W12. "Download Only" permanently skips the malware-shield question.**
`WizardContainer.tsx:291-296` calls `setStep()` directly rather than `next()`, so the
`upsync_ask → security` route is dead code and `enable_malware_shield` stays at its `false`
default. No history push either, so Back from `dest_cloud_select` skips `upsync_ask`.

**W13. Edit-menu jumps push no history.** `WizardContainer.tsx:274`. Press Back after a jump →
history empty → `onCancel()` closes the entire wizard instead of returning to the menu.

**W14. Edit-mode "SYSTEM INTEGRATION" restarts the whole wizard.** `:147-148` — `shortcut` and
`download_mode` never check `isMenuMode`, unlike every other step.

**W15. `findNextStep`'s resume checks are dead.** `wizard-utils.ts:31-32` tests
`strict_mirror === undefined`, but `loadConfig` merges over `EMPTY_CONFIG` where both are
`false` (`config.ts:74-76`). Quit after entering `local_dir`, relaunch, "continue" → resumes at
`deploy`, silently defaulting mirror/upsync/security.

**W16. Shortcut-recovery options do nothing.** `getOptions:212` emits `bootstrap`/`shortcut`/`skip`
types; `confirmSelection` handles none. "RECREATE" recreates nothing; "I MOVED IT, don't ask
again" never sets `desktop_shortcut: 2`, so it asks again. Answering "NO" (`0`) is likewise never
remembered (`wizard-utils.ts:27` only skips on `=== 2`).

**W17. SFTP placeholder teaches a format that breaks the remote.**
`CloudDirectEntryStep.tsx:39` shows `sftp.example.com:22`; `providerHandlers.ts:38-48` passes the
whole string as rclone's `host` (port is a separate option, never collected) → DNS failure.

**W18. Four dead duplicate step components — modified on this branch.**
`steps/LocalDirStep.tsx`, `steps/MirrorStep.tsx`, `steps/SourceChoiceStep.tsx`,
`steps/UpsyncAskStep.tsx` are imported nowhere (`WizardStepRenderer.tsx:44-48` uses the
root-level `DirectoryConfig`/`MirrorSettings`/`SourceChoice`/`UpsyncConfig`). All four appear in
`git status`. **Someone has been styling files that never render.**

Also: side effects (`onComplete`, `resetWizardRefs`) run inside the `setStep` functional updater
(`:150-151, 169, 185`) — double-invocation-unsafe; history is pushed even when the step doesn't
change (`:141` before the guards at `:152, 176`) so Back must be pressed twice; step numbers are
`history.length + 1` (`:107`) so users see "Step 7" on the third screen.

---

## Tier 4 — Keyboard model and layout

**K1. There is no focus model.** Every `useKeyboard` handler in OpenTUI is a global subscriber;
`emitWithPriority` (`@opentui/core/index-s0q9547t.js:2488`) runs all globals in mount order and
*then* the focused input's handlers. This app mounts 8+ global handlers (AppContent,
WizardContainer, Options, FontMissingBanner, ForensicView, FontInstaller, ManualFontGuide, two
PerformanceSelectors) and **never calls `key.stopPropagation()`**. The single
`e.stopPropagation()` at `CloudDirectEntryStep.tsx:117` runs in the renderable phase and is dead.
Everything below follows from this.

**K2. The sync view is a keyboard trap.** `handleSyncKeys` (`AppContent.tsx:158-167`,
`SyncKeyHandler.ts:4-17`) runs before any focus check and takes no `focusArea`. It swallows
`return` unconditionally (`:99-102`), so with the footer's "Exit" focused, Enter **toggles the
sync** instead of exiting. Arrows never reach footer navigation; `h` (Home) is eaten as vim-left;
`b` is explicitly excluded. There is no keyboard path out except Ctrl+C.

**K3. Footer Enter also fires the wizard's selected option.** The selectable-steps block
(`WizardContainer.tsx:417-429`) ignores `focusArea`. Exiting via footer "Home" simultaneously
runs `confirmSelection` on whatever body option was highlighted — e.g. committing a malware
policy the user never chose. Tab is hijacked too: `AppContent.tsx:274-276` jumps to the footer on
the same press that `WizardContainer.tsx:308-354` advances the wizard index; a second Tab sets
`focusArea="header"`, a region the wizard doesn't render, leaving arrows and Enter driving an
invisible selection.

**K4. `b` anywhere in Options ejects to the dashboard.** `AppContent.tsx:169` → `setView("dashboard")`
runs before Options' own `b` handler (`Options.tsx:236-239`), which wanted to step
logs→debug→menu. Options' internal back-navigation is dead code.

**K5. FontMissingBanner and Dashboard handle the same keys at once.** The banner renders *on* the
dashboard with an unguarded handler (`FontMissingBanner.tsx:26-49`) while
`AppContent.tsx:288-301` is also live: one Enter triggers both actions; last `setView` wins
nondeterministically.

**K6. Hotkeys mean five different things by screen.** Options digits execute immediately
(`Options.tsx:210-217`); wizard digits select-then-Enter (`WizardContainer.tsx:424-426`); doctor
and footer letters only move focus (`AppContent.tsx:187-188, 284-285`); FontMissingBanner `y/n/?`
execute immediately. The footer's own help text says "Hotkey + ENTER to confirm" — true on some
screens, false on others. Escape likewise: global Escape only *focuses* Exit, but ForensicView,
FontMissingBanner, ManualFontGuide, and FontInstaller each cancel immediately — and since the
global handler also runs, closing the font guide leaves "Exit" focused, so the user's next Enter
quits the app.

**K7. Dashboard needs ~47 rows; it renders in 24.** `Splash.tsx:56-57` gates on **width only** —
at width ≥ 75 it renders 26 rows of ASCII art (+ border/tagline ≈ 33). Plus Dashboard (~12-16) and
the fixed 10-row footer (`AppContent.tsx:416`) ≈ 47+ rows. At 80×24 the "Begin Setup" and
"Sync Portal" buttons are simply off-screen. No height check exists anywhere.

**K8. Sync view at 80×24: `availableHeight` computes to 1 row; the panels need 29.**
`SyncPortal.tsx:192-196`: `24 − 5 − 10 − 8 = 1`. `canFit2` needs ≥ 87 cols (`:165-166`), so panels
stack full-width with floors summing to 29 rows inside a box of height 13 with
`overflow="hidden"` (`:231`). Panels 2 and 3 are invisible. The layout only fully fits at
≥ 120×40. `PANEL_OVERHEAD` keys off *terminal* width rather than panel width (`:220-224`).

**K9. Wizard has zero height adaptation.** Chrome ≈ 10 rows + app chrome 13 ⇒ ~1 content row at
80×24. `source_choice` renders 10 always-bordered 3-row provider boxes ≈ 33 rows
(`SourceChoice.tsx:43-45`); no scroll container, no truncation. Options past the fold are
visually unreachable while keyboard selection still cycles through them invisibly.

**K10. Bordered one-line widgets cost 3 rows each and cause focus jitter.** Where
`border={isFocused}` is conditional (`MirrorSettings.tsx:71` vs its always-bordered options at
`:43`), focusing adds 2 rows and shifts the column. Dashboard and footer buttons combine
`height={1}` with a conditional border (`Dashboard.tsx:142-147`, `AppContent.tsx:436`) — a 1-row
box cannot hold top+bottom border plus content, so the focus border is clipped.
`DeployStep.tsx:29` hard-codes `height={7}` around ~10 rows of content.
`Dashboard.tsx:58` renders the full `local_dir` with no `flexShrink`, while FileQueue
(`SyncPortalParts.tsx:328-331`) truncates manually — a third overflow convention.

**Corrections to GPT's Claim 6:** there is no `q`=quit binding, and `s` on the dashboard only
moves focus (`AppContent.tsx:297`). GPT invented its examples; the defect class is real and worse.
**Correction to Claim 7:** the app *does* use `useTerminalDimensions` and react to resize —
adaptation is width-tiered with hard-coded height constants.

---

## Recommended sequence

**Before anything else (minutes):**
1. Delete `src/lib/rclone.ts:57`. Invalidate the CopyParty session in `logs/auth_debug.log`.
2. Add `test_sync_fail_*` to `.gitignore`; fix `sync-flow.test.tsx:100` to use a temp dir.

**Stop the bleeding (Tier 0) — nothing else matters until these are done:**
3. Remove `--ignore-errors` from `RETRY_FLAGS`, or split it so it never applies to `sync`.
4. Check extractor exit codes in `cleanup.ts`; make deletion conditional on verified extraction.
   Never add to the exclude ledger on a failed extraction.
5. Wire `Env.isSafeDirectory()` into the wizard's `dir_confirm` and `sync/index.ts` — and widen it
   (block `$HOME`, `/`, any dir with >N pre-existing non-schematic files without an explicit
   confirmation step).
6. Gate D6's forensic remote-delete behind an explicit opt-in; it should never fire from a
   heuristic.

**Make failures visible (Tier 2):** give `runSync` a real return type
(`{ phases: {pull, clean, cloud}, status }`), propagate it to `ntfy-worker` (exit non-zero),
`cloudPhase`, and `last_sync_stats`. This is a contained refactor and unlocks honest UI.

**Fix the wizard's root cause (Tier 3):** make step components consume `getOptions()` instead of
hardcoding their own lists. W1, W5, W7 and half the others disappear at once. Delete the four
dead step files first so you stop editing them. Then remove the autosave (W3) and add a commit
step.

**Fix the keyboard model (Tier 4):** one key owner per view, or have every global handler consult
a shared focus model and call `key.stopPropagation()` when it consumes a key. Until then,
guard `WizardContainer.tsx:417` on `focusArea === "body"` and exclude text-input steps from `b`
and digit handling — that alone fixes the "typing a path navigates" class.

**Layout (Tier 4):** the fixed 10-row footer (42% of an 80×24 terminal) is the direct cause of the
starvation in K7/K8. Make it collapse below a height threshold, gate the splash on height as well
as width, and add a scroll container to the wizard.

---

## A note on the test suite

At audit time 207 tests passed, `tsc` was clean, and the custom TUI linter reported no
violations — while the edit menu opened the wrong screens, the daemon reported success on
failure, and archives were deleted on failed extraction. The tests verified that components
render and that pure functions compute; none asserted that a keypress reaches its labelled
target, that a failed subprocess prevents a delete, or that a reported success corresponds to
work done.

The regression tests added alongside the fixes close exactly those three gaps:

- `src/tests/destructive-safety.test.ts` — extractor exits non-zero ⇒ archive still exists,
  is not added to the exclusion ledger, and is reported unscanned; an archive whose listing
  merely contains the word "error" is not condemned; the directory guard rejects `/`, `$HOME`,
  and traversal; `--ignore-errors` is never sent. (Verified to fail against the pre-fix code.)
- `src/tests/wizard-options.test.ts` — the keyboard's option list matches the rendered list
  for the edit menu and the security step; every hotkey addresses its own row; each directory
  step shows its own path; S3 collects the credentials its handler reads.
- `src/tests/AppContentKeyboard.test.tsx` — the sync view declines every key when the footer
  owns focus, so Enter on "Exit" exits instead of toggling the sync.
- `src/tests/e2e/sync-flow.test.tsx` — a failed run returns `status: "error"` and persists it,
  and an unsafe `local_dir` is refused outright.

One caveat worth recording: the old `wizard-complete` e2e test passed *because of* a bug —
Enter on the path input skipped validation, so an empty `local_dir` sailed through to Deploy.
It now seeds a real path and walks the true step graph.
