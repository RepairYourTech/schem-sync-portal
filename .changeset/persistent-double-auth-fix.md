---
"schem-sync-portal": patch
---

Resolve the persistent double authentication bug by implementing a three-layer defense strategy: a synchronous mutex in `useWizardAuth`, event bubbling isolation in `CloudDirectEntryStep`, and a keyboard handler guard in `WizardContainer`. Fixes #23.
