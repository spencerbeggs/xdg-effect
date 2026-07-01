---
"xdg-effect": minor
---

## Features

### Platform-native config search

Add platform-native config discovery. A new `NativeConfigResolver` probes the
OS-native config directory (`~/Library/Application Support/<app>` on macOS,
`%APPDATA%\<app>` on Windows). `AppDirsConfig` gains a `native` option so
`AppDirs` resolves native directories as the primary location (XDG env still
wins; no-op on Linux). A new `XdgConfigLive.layered` preset wires the full
project→user→system chain (dot-config walk, XDG, native, `/etc`), and a pure
`nativeDirs` helper exposes the native path mappings. `XdgResolver` now also
reads `APPDATA`/`LOCALAPPDATA`.
