# fixen-app

The fixen **menubar app**: a Tauri 2 tray shell around the fixen CLI. The CLI
stays the single correction engine — the app just runs `fixen --gui` as a
managed child process and shows the dashboard in a compact always-on-top
panel, one tray click away.

```
tray icon (coral proofreader mark)
├─ left click  → toggle the dashboard panel (430x680, always on top)
└─ right click → Quit fixen (also stops the managed server)
```

## How it finds the CLI

1. `FIXEN_APP_CLI` — full command, e.g. `node /path/to/fixen.js`
2. `fixen` on `PATH`
3. the repo checkout baked in at build time (`../bin/fixen.js` via `node`)

A candidate that cannot serve `--gui` (an older release) is skipped and the
next one is tried.

## Correction toasts

While the app is running, every new correction (chat sidecar, hotkey, or a
plain `fixen` run) pops a small toast near where you are typing for ~6
seconds; clicking it opens the full panel.

- **Caret-anchored** placement uses the macOS Accessibility API and activates
  automatically once you grant the app permission: System Settings → Privacy &
  Security → Accessibility → add/enable `fixen.app`. The app never prompts on
  its own.
- Without that permission the toast appears next to the **mouse cursor**
  instead — no permission needed.

## Build & run

```sh
cd app
npm install          # @tauri-apps/cli
npm run build        # → src-tauri/target/release/bundle/macos/fixen.app
open src-tauri/target/release/bundle/macos/fixen.app
```

Dev loop: `npm run dev`. Rust unit tests: `cargo test` in `src-tauri/`.

## Distribution notes

The bundle is unsigned. For handing it to other machines you need the usual
macOS pipeline: Developer ID signing (`codesign`), notarization
(`notarytool`), and an update channel (Tauri updater or Homebrew cask).
Local builds run as-is.
