# Changelog

## 1.4.2

### Patch Changes

- 56eebaa: fix: lean mode pattern matching now uses word boundary detection to block folders like '10 BIOS'

## 1.4.1

### Patch Changes

- e1802f4: Fix workflow discovery by removing duplicate frontmatter and making file public

## 1.4.0

### Minor Changes

- 5c9f020: Standardize Header/Footer focus and navigation, unified FocusArea types, and hardened sync stop reliability.

## 1.3.1

### Patch Changes

- 3557f79: Hardened Lean Mode with surgical non-whitelist purging, path-aware filtering for BIOS directories, and enforced 'extract' policy trust contract. Added regression tests.
- 3557f79: Hardened Lean Mode logic, enforced extract policy trust, restored documentation, and implemented system-wide test environment isolation.

## 1.3.0

### Minor Changes

- 8332072: feat: standardize wizard navigation, refactor Options.tsx, and ensure hover consistency

### Patch Changes

- 8332072: address code review feedback: fix hardcoded test paths, remove redundant props, and refine dashboard state updates

## 1.2.3

### Patch Changes

- 2a9be7f: Resolve the persistent double authentication bug by implementing a three-layer defense strategy: a synchronous mutex in `useWizardAuth`, event bubbling isolation in `CloudDirectEntryStep`, and a keyboard handler guard in `WizardContainer`. Fixes #23.

## 1.2.2

### Patch Changes

- f7258bf: fix(wizard): resolve double OAuth trigger and restore keyboard navigation

## 1.2.1

### Patch Changes

- afff6a6: fix: address CodeRabbit feedback for Lean Mode optimizations

## 1.2.0

### Minor Changes

- 71582f3: Implement Lean Mode for downloads (Issue #4)

## 1.1.0

### Minor Changes

- f6f27c6: feat: implement GitHub API-based update notification system and UI integration

## 1.0.5

### Patch Changes

- cb89fea: fix(ui): resolve sync panel layout overflows and height budgeting for improved responsiveness on different terminal sizes.

## 1.0.4

### Patch Changes

- 89a5aac: fix: remove plaintext credentials from config.json to prevent security leaks

## 1.0.3

### Patch Changes

- 6ea2f48: patch
- 6ea2f48: remediate security findings discovered by CodeQL

## 1.0.2

### Patch Changes

- c633051: fix: prevent cloud sync duplication by introducing remote manifest verification and session persistence hardening.

## 1.0.1

### Patch Changes

- cb00f5c: This is an automated test to verify the `/push-changes` workflow integration.

## 1.0.0

### Patch Changes

- 07de7d4: initial setup of changesets

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Proper changelog support using `@changesets/cli`.
- Link to changelog in the "About Portal" section.
