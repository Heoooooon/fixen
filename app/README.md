# fixen-app

The fixen **menubar app**: a Tauri 2 tray shell around the fixen CLI. The CLI
stays the single correction engine — the app just runs `fixen --gui` as a
managed child process and shows the dashboard in a compact always-on-top
panel, one tray click away.

```
tray icon (native monochrome proofreader mark)
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

## Signing & distribution

Local builds are **signed** with the Developer ID certificate configured in
`src-tauri/tauri.conf.json` (`bundle.macOS.signingIdentity`, hardened runtime
on). `npm run build` therefore produces a bundle that passes
`codesign --verify --deep --strict` and runs cleanly on this machine and via
AirDrop/USB to machines that right-click-open once.

For public distribution, **notarization** is still required. Follow the
lazy-starter-kit release pattern (`.github/workflows/release.yml` there):
CI holds the Apple ID / team / app-specific password as repository secrets,
zips the bundle, runs `xcrun notarytool submit --wait`, then staples with
`xcrun stapler staple`. Wire the same three secrets into this repo's release
workflow when the first public build ships; the dmg target is already enabled
in `tauri.conf.json` (`bundle.targets`).

Menubar icon: `icons/tray.png` is a monochrome template image (pure black +
alpha, rendered from `icons/tray-src.html`); macOS recolors it for light/dark
menu bars. The app icon set is generated from `icons/icon-src.html` —
`npx playwright screenshot → npx tauri icon` regenerates everything.
