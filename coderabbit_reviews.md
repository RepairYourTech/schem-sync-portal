**Actionable comments posted: 7**

> [!CAUTION]
> Some comments are outside the diff and can’t be posted inline due to platform limitations.
> 
> 
> 
> <details>
> <summary>⚠️ Outside diff range comments (7)</summary><blockquote>
> 
> <details>
> <summary>src/components/wizard/SourceChoice.tsx (1)</summary><blockquote>
> 
> `33-61`: _⚠️ Potential issue_ | _🟡 Minor_
> 
> **Focus tracking assumes back option is always last in `allOptions`.**
> 
> The filtered list (line 33) removes the "back" option, then uses the filtered index `i` to compare against `selectedIndex` (line 35). This only produces correct focus highlighting if the "back" option is the last entry in `allOptions`. If it were ever inserted at a non-terminal position, the filtered indices would no longer align with `selectedIndex` values, causing focus to highlight the wrong row.
> 
> That said, `confirmSelection(opt)` on line 43 correctly passes the option object rather than indexing — this is safer than the approach in the other step files and should be the preferred pattern.
> 
> </blockquote></details>
> <details>
> <summary>src/components/wizard/UpsyncConfig.tsx (1)</summary><blockquote>
> 
> `7-84`: _⚠️ Potential issue_ | _🔴 Critical_
> 
> **Remove unused UpsyncAskStep.tsx file.**
> 
> UpsyncAskStep in `src/components/wizard/steps/` is not imported or referenced anywhere in the codebase. UpsyncConfig is the active component being used for the "upsync_ask" step in WizardStepRenderer.tsx. Delete the unused file to reduce code maintenance burden.
> 
> </blockquote></details>
> <details>
> <summary>src/tests/e2e/sync-flow.test.tsx (1)</summary><blockquote>
> 
> `38-38`: _⚠️ Potential issue_ | _🟡 Minor_
> 
> **Test name still references the removed "clean" phase.**
> 
> The assertion for the `"clean"` phase was removed (line 67), but the test description still reads `"should progress through pull, clean, and cloud phases"`. Update it to match the current behavior.
> 
> <details>
> <summary>✏️ Suggested fix</summary>
> 
> ```diff
> -    it("should progress through pull, clean, and cloud phases", async () => {
> +    it("should progress through syncing and done phases", async () => {
> ```
> </details>
> 
> </blockquote></details>
> <details>
> <summary>src/components/wizard/providers/GDriveSetup.tsx (1)</summary><blockquote>
> 
> `150-179`: _⚠️ Potential issue_ | _🟡 Minor_
> 
> **NEXT STEP and Back can both appear focused simultaneously.**
> 
> The NEXT STEP button (line 156) uses `focusArea === "body"` without checking `selectedIndex`, while the Back button (line 176) checks `selectedIndex === 1 && focusArea === "body"`. When `selectedIndex` is 1 and focus is on body, both buttons render as focused.
> 
> Gate the NEXT STEP button's focus on `selectedIndex === 0`:
> 
> <details>
> <summary>🐛 Proposed fix</summary>
> 
> ```diff
> -                    borderColor={focusArea === "body" ? colors.success : colors.dim}
> +                    borderColor={selectedIndex === 0 && focusArea === "body" ? colors.success : colors.dim}
> ```
> ```diff
> -                    <Hotkey keyLabel="1" label={guide.buttonLabel} isFocused={focusArea === "body"} />
> +                    <Hotkey keyLabel="1" label={guide.buttonLabel} isFocused={selectedIndex === 0 && focusArea === "body"} />
> ```
> </details>
> 
> </blockquote></details>
> <details>
> <summary>src/components/wizard/providers/DropboxSetup.tsx (1)</summary><blockquote>
> 
> `132-160`: _⚠️ Potential issue_ | _🟡 Minor_
> 
> **Guide section: "Next" button doesn't reset `selectedIndex`, causing both buttons to appear focused simultaneously.**
> 
> The "NEXT STEP"/"DONE" button (Line 134) sets `onMouseOver={() => onFocusChange("body")}` but never resets `selectedIndex`. If the user hovers "Back" (setting `selectedIndex=1`), then moves to the "Next" button, both will show a green border because:
> - Next: `borderColor={focusArea === "body" ? colors.success : ...}` — always green when body-focused
> - Back: `borderColor={selectedIndex === 1 && focusArea === "body" ? colors.success : ...}` — still green since `selectedIndex` wasn't reset
> 
> <details>
> <summary>🔧 Proposed fix — set selectedIndex to 0 when hovering "Next"</summary>
> 
> ```diff
>                  <box
>                      marginTop={1}
> -                    onMouseOver={() => onFocusChange("body")}
> +                    onMouseOver={() => { onFocusChange("body"); setSelectedIndex(0); }}
>                      onMouseDown={() => next()}
> ```
> </details>
> 
> </blockquote></details>
> <details>
> <summary>src/components/Options.tsx (1)</summary><blockquote>
> 
> `222-229`: _⚠️ Potential issue_ | _🟠 Major_
> 
> **Pressing Enter on the "Back" button (index 3) in logs view does nothing.**
> 
> The `return` key handler (Lines 222–225) only handles indices 0, 1, and 2. Index 3 (Back button) is only reachable via the `"b"` hotkey (Line 226), but a user who Tab/arrow-navigates to the Back button and presses Enter will see no response.
> 
> <details>
> <summary>🐛 Proposed fix</summary>
> 
> ```diff
>                  } else if (e.name === "return") {
>                      if (logSelectedIndex === 0) handleRefreshLogs();
>                      else if (logSelectedIndex === 1) handleCopyLogs();
>                      else if (logSelectedIndex === 2) handleClearLogs();
> +                    else if (logSelectedIndex === 3) setSubView("debug");
>                  } else if (e.name === "b") {
> ```
> </details>
> 
> </blockquote></details>
> <details>
> <summary>src/components/wizard/WizardContainer.tsx (1)</summary><blockquote>
> 
> `392-404`: _⚠️ Potential issue_ | _🔴 Critical_
> 
> **Add `copyparty_config` to `selectableSteps` array and update `getOptions()` to handle `cloud_direct_entry`.**
> 
> Both `copyparty_config` and `cloud_direct_entry` currently bypass the unified "b" hotkey handler:
> 
> - `copyparty_config` is excluded from `selectableSteps` (line 392), so it never reaches the "b" handler.
> - `cloud_direct_entry` is in `selectableSteps` but `getOptions()` has no case for it, returning `[]` and triggering an early return at line 395 before the "b" handler.
> 
> Both steps currently handle back only via the Return key on a dedicated back control (lines 368 and 378). To complete the PR goal of unifying back navigation to the "b" hotkey, either:
> 1. Add `copyparty_config` to `selectableSteps` and add a case for it in `getOptions()`, or
> 2. Move both steps' "b" key handling to their dedicated sections (around lines 348-354 and 358-363).
> 
> </blockquote></details>
> 
> </blockquote></details>

<details>
<summary>🤖 Fix all issues with AI agents</summary>

```
In `@src/components/AboutView.tsx`:
- Line 21: The AboutView prop focusArea is typed as string but should be the
union "body" | "footer" to match how it’s used and how onFocusChange is defined;
update the AboutView props/interface (the focusArea property) to use the literal
union type "body" | "footer" instead of string so TypeScript enforces valid
values in comparisons inside AboutView (references: AboutView component,
focusArea prop, onFocusChange handler).

In `@src/components/wizard/steps/CloudDirectEntryStep.tsx`:
- Around line 144-157: The Back button's focus logic in CloudDirectEntryStep
(the box wrapping Hotkey and the borderColor/isFocused checks) currently only
checks direct_entry_index === fields.length + 1 and needs to also require
focusArea === "body"; update the onMouseOver handler to set_focus only when
focusArea === "body" (or include focusArea check), and change the borderColor
expression and Hotkey's isFocused prop to && both conditions (focusArea ===
"body" && direct_entry_index === fields.length + 1) so the Back button only
appears focused when the body is focused and the index matches, leaving back()
behavior unchanged.

In `@src/components/wizard/steps/DestCloudSelectStep.tsx`:
- Around line 35-37: The map over (allOptions.filter(...)) in
DestCloudSelectStep uses the filtered array index i to compare against
selectedIndex (and focusArea), which mismatches if the "back" option isn’t last;
fix by deriving the original index for each filtered option (e.g., map the
filtered items to their index in allOptions via allOptions.findIndex or build a
filteredIndices array) and use that originalIndex when computing
isFocused/selection, keeping getProviderMetadata(opt.value) and the rest of the
rendering unchanged.

In `@src/components/wizard/steps/EditMenuStep.tsx`:
- Around line 58-75: The Back button's onMouseOver only calls
onFocusChange("body") so the focus styling tied to selectedIndex never
activates; update the box's onMouseOver handler (the element containing Hotkey)
to also call setSelectedIndex(options.length) so selectedIndex ===
options.length becomes true on hover; ensure you import/receive setSelectedIndex
and use it alongside onFocusChange("body") to trigger the border highlight for
the Hotkey/Back UI element.

In `@src/components/wizard/steps/SecurityStep.tsx`:
- Around line 30-32: The click handler currently uses the loop index from
filteredOptions to index into allOptions which is fragile; change the
onMouseDown handler to pass the actual WizardOption object to confirmSelection
instead of an index—e.g., when iterating filteredOptions, derive the
corresponding full option by matching a stable key (like option.id, option.type
or option.value) against getOptions() (allOptions) and call
confirmSelection(matchedOption) or simply call confirmSelection(opt) if
filteredOptions already contains full WizardOption objects; update
types/signatures if needed so confirmSelection accepts a WizardOption rather
than an index and remove reliance on positional selectedIndex/allOptions
indexing (references: filteredOptions, allOptions, getOptions(), onMouseDown,
confirmSelection, backIdx, isBackFocused).

In `@src/components/wizard/steps/ShortcutStep.tsx`:
- Around line 57-72: The Back button's onMouseOver only calls
onFocusChange("body") so hover doesn't set the selected index; update the
onMouseOver handler on the box around the Back button to also call
setSelectedIndex(options.length) (so the Back button becomes selected on hover),
keeping the existing onMouseDown confirmSelection({ value: "back", type: "back"
}) behavior; reference the box containing the Hotkey, selectedIndex,
options.length, setSelectedIndex, onFocusChange, and confirmSelection to locate
where to add this call.

In `@src/components/wizard/steps/UpsyncAskStep.tsx`:
- Line 41: The onMouseDown handler is calling getOptions() inline instead of
using the cached const allOptions = getOptions(); update the handler in the
UpsyncAskStep component to pass the already-cached option (use allOptions[i]!)
to confirmSelection instead of calling getOptions()[i]!, keeping usage
consistent with other files and avoiding the redundant getOptions() call; adjust
the onMouseDown that currently references getOptions() to reference allOptions
and ensure the non-null assertion (!) is preserved.
```

</details>

<details>
<summary>🧹 Nitpick comments (14)</summary><blockquote>

<details>
<summary>src/components/ManualFontGuide.tsx (1)</summary><blockquote>

`15-15`: **`returnView` is accepted but unused.**

The prop is destructured as `_returnView` and never referenced. If it's only here to satisfy a shared interface shape, consider making it optional in `ManualFontGuideProps` or removing it until actually needed, to avoid confusing future readers.

</blockquote></details>
<details>
<summary>src/components/ForensicView.tsx (1)</summary><blockquote>

`110-119`: **`isFocused` has no effect on ESC-labeled Hotkeys.**

Per `Hotkey.tsx`, when `keyLabel` is `"escape"`, the bracket/key colors are always `colors.danger` regardless of `isFocused`. The prop is silently ignored here, which could mislead future readers into thinking this element has distinct focused styling.


<details>
<summary>Proposed fix</summary>

```diff
-                                <Hotkey keyLabel="escape" label="Return to Options" isFocused />
+                                <Hotkey keyLabel="escape" label="Return to Options" />
```
</details>

</blockquote></details>
<details>
<summary>src/components/wizard/steps/SecurityStep.tsx (1)</summary><blockquote>

`69-93`: **Duplicated back-button block across 7+ wizard step files.**

This exact JSX block (margin, mouse handlers, border styling, `Hotkey` with `keyLabel="b"`) is copy-pasted verbatim across SecurityStep, OneDriveSetup, MegaSetup, S3Setup, MirrorSettings, CopypartyConfigStep, and SourceChoice. Consider extracting a shared `<BackButton>` component that accepts `isBackFocused`, `backIdx`, `onFocusChange`, `setSelectedIndex`, and `back` to eliminate the duplication and ensure future styling/behavior changes propagate consistently.

</blockquote></details>
<details>
<summary>src/components/wizard/providers/OneDriveSetup.tsx (2)</summary><blockquote>

`53-55`: **Same positional-indexing concern as other steps.**

`confirmSelection(allOptions[i]!)` relies on the local `options` array indices matching `allOptions` indices. Here the local array is not filtered so it's safe, but the non-null assertion `!` will crash if `allOptions` is shorter than expected. A defensive check or direct option-object pass would be more robust.

---

`144-160`: **Hardcoded `setSelectedIndex(1)` in guide back button.**

The back button in the guide section uses a hardcoded index of `1`, which couples this to the assumption that there's exactly one other interactive element (the "next" button at index 0). This is repeated identically in MegaSetup and S3Setup guide sections. If the guide layout ever changes, this will silently break focus tracking.

</blockquote></details>
<details>
<summary>src/components/wizard/providers/MegaSetup.tsx (1)</summary><blockquote>

`34-35`: **Stray blank lines.**

Lines 34–35 appear to be leftover artifacts from removed code. Minor nit.

</blockquote></details>
<details>
<summary>src/components/wizard/providers/PCloudSetup.tsx (1)</summary><blockquote>

`135-151`: **Guides view: hardcoded back index diverges from the `backIdx` pattern used elsewhere.**

In the Intro view you use the computed `backIdx` for focus state, but in the Guides view you hardcode `selectedIndex === 1` and `setSelectedIndex(1)`. This works today because the guide always has exactly two interactive elements, but it's fragile if the guide layout changes. Consider reusing `backIdx` or a local constant for consistency.

</blockquote></details>
<details>
<summary>src/components/wizard/providers/SFTPSetup.tsx (1)</summary><blockquote>

`136-152`: **Same hardcoded back index concern as PCloudSetup Guides view.**

As noted in PCloudSetup.tsx, the Guides view hardcodes `selectedIndex === 1` and `setSelectedIndex(1)` instead of using `backIdx`. Same fragility applies here.

</blockquote></details>
<details>
<summary>src/components/wizard/steps/DownloadModeStep.tsx (1)</summary><blockquote>

`27-29`: **Index mapping between filtered and unfiltered arrays is fragile.**

`backIdx` is the index in the unfiltered `allOptions`, while `i` on line 38 is the index in the filtered (no-back) array. Focus works correctly only because the back option is always the last element in `allOptions` — if it ever appears at any other position, `selectedIndex` would match both a regular option and the back button simultaneously.

A safer approach is to compute the back index relative to the visual item count:

<details>
<summary>♻️ Suggested improvement</summary>

```diff
 const allOptions = getOptions();
-const backIdx = allOptions.findIndex(o => o.type === "back");
-const isBackFocused = selectedIndex === backIdx && focusArea === "body";
+const nonBackOptions = allOptions.filter(o => o.type !== "back");
+const hasBack = allOptions.some(o => o.type === "back");
+const backIdx = nonBackOptions.length; // always after the last visible option
+const isBackFocused = selectedIndex === backIdx && focusArea === "body";
```

Then use `nonBackOptions` in the `.map()` below instead of filtering inline.
</details>




Also applies to: 37-38

</blockquote></details>
<details>
<summary>src/components/wizard/providers/GDriveSetup.tsx (1)</summary><blockquote>

`53-53`: **Fragile positional coupling between local `options` and `allOptions`.**

`confirmSelection(allOptions[i]!)` assumes the first N items in `allOptions` (from `getOptions()`) match the local `options` array exactly in order. If the options provider ever reorders or inserts items before the back option, this will silently dispatch the wrong option. Consider matching by value instead:

<details>
<summary>♻️ Safer alternative</summary>

```diff
-onMouseDown={() => confirmSelection(allOptions[i]!)}
+onMouseDown={() => confirmSelection(allOptions.find(o => o.value === opt.value)!)}
```
</details>

</blockquote></details>
<details>
<summary>src/components/wizard/steps/BackupDirStep.tsx (1)</summary><blockquote>

`22-51`: **Hardcoded indices work but diverge from the `backIdx` pattern used in provider components.**

The CONFIRM button uses index 1 and BACK uses index 2, which match the `getOptions()` return for `"backup_dir"` step in `WizardContainer.tsx` (Line 216: `dir_input` at 0, `dir_confirm` at 1, `back` at 2). This is correct.

For consistency with the provider components (`allOptions.findIndex(o => o.type === "back")`), consider deriving `backIdx` dynamically, though the fixed option list makes this low-risk.

</blockquote></details>
<details>
<summary>src/components/wizard/providers/B2Setup.tsx (1)</summary><blockquote>

`8-97`: **High code duplication across provider setup components (DropboxSetup, R2Setup, B2Setup, and likely others).**

The intro/back-button and guide/back-button rendering blocks are nearly identical across all three reviewed provider files (and the summary mentions ~8 total). The only differences are provider-specific strings (title, description, guide text, step names).

Consider extracting a shared `ProviderIntroView` and `ProviderGuideView` component that accept provider-specific data as props. This would centralize the back-button logic and fix the dual-focus bug in one place.

</blockquote></details>
<details>
<summary>src/components/wizard/WizardContainer.tsx (1)</summary><blockquote>

`22-22`: **`returnView` prop is accepted but never used inside `WizardContainer`.**

`_returnView` is destructured and discarded. The comment at Line 117 says "Respect returnView if provided" but only `onCancel()` is called. The actual return-view logic lives in `AppContent.tsx` (Line 444: `onCancel={() => setView(wizardReturnView)}`), making this prop redundant. It adds surface area to the component API without benefit.

Consider either removing the prop from `WizardProps` and `WizardContainer` or actually using it inside `back()` as the comment suggests.

</blockquote></details>
<details>
<summary>src/components/AppContent.tsx (1)</summary><blockquote>

`285-293`: **`setWizardReturnView("dashboard")` on "s" and "c" hotkeys is premature but harmless.**

Lines 290–291 set `wizardReturnView` when the user presses "s" or "c", but these keys only change `bodyIndex` (highlight the button) — they don't navigate to the wizard. The actual navigation is on Enter (Lines 285–286), which also sets `wizardReturnView`. The premature set is a no-op in practice.

</blockquote></details>

</blockquote></details>

<!-- This is an auto-generated comment by CodeRabbit for review status -->
**Actionable comments posted: 1**

<details>
<summary>🤖 Fix all issues with AI agents</summary>

```
In `@src/tests/rclone.test.ts`:
- Line 48: Replace the hardcoded developer-specific absolute path assigned to
process.env.RCLONE_CONFIG_PATH in src/tests/rclone.test.ts with a generic,
non-user-specific path (e.g., derive it from __dirname or use a simple
relative/path in the test directory) so tests don't leak local usernames; update
the assignment to set process.env.RCLONE_CONFIG_PATH to a neutral path (for
example using __dirname or a relative test fixture path) where fs is mocked.
```

</details>

<!-- This is an auto-generated comment by CodeRabbit for review status -->
