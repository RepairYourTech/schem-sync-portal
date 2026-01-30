# Technical Incident Report: FlexBV Input Mapping on Arch Linux (SDL3 Migration)

**To:** FlexBV Developer
**From:** Birdman's System Architect
**Date:** 2026-01-28
**Subject:** Input Regression with `sdl2-compat` (System-wide SDL3 transition)

## The Issue
On modern rolling-release distributions (Arch Linux), the `sdl2` package is increasingly being replaced by `sdl2-compat`, a compatibility layer that translates SDL2 calls to the SDL3 backend.

This caused FlexBV 5.1244 to misinterpret navigation keys:
- **Symptom:** `PageUp`/`PageDown` events were incorrectly mapped to Physical Scancodes (`Keypad9`/`Keypad3`) regardless of NumLock state.
- **Root Cause:** Inconsistent scancode-to-keycode translation in the SDL3 compatibility layer versus legacy SDL2.

## The Fix (User Side)
We resolved this by forcing the application to load a bundled, native `libSDL2-2.0.so.0` (version 2.30.x) via `LD_LIBRARY_PATH`, bypassing the system's `sdl2-compat` layer.

## Recommendation for Future Builds
To ensure stability across distributions migrating to SDL3:
1.  **Bundle the Runtime:** Consider shipping the exact `libSDL2` shared object your binary was built against in a `/libs` folder relative to the executable.
2.  **Rpath Linking:** Link the binary with `-rpath='$ORIGIN/libs'` so it prefers the bundled library over the system one.
3.  **Input Handling update:** If updating the codebase, verify `SDL_scancode` vs `SDL_Keycode` handling to ensure logical keys (PageUp) are prioritized over physical location (Numpad) in the event loop.

*This ensures identical behavior regardless of the user's installed graphics stack.*
