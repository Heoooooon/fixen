# fixen design system

## 0. Direction

fixen feels like a quiet proofreader working on warm paper, not another
blue-purple AI tool. The signature moment is the coral insertion caret cutting
cleanly through an ink line.

Reference: Apple menu-extra restraint and optical precision, combined with the
existing fixen warm-paper identity in `bin/gui.html`.

## 1. Tokens

- Paper: `#fbf8f1`
- Paper highlight: `#fffdf8`
- Paper shade: `#efe6d4`
- Ink: `#191714`
- Ink secondary: `#2f2a23`
- Coral: `#e0603f`
- Coral highlight: `#f4855f`
- Coral deep: `#bf3828`

## 2. Typography

Use the macOS system family for application UI. Labels stay compact and
sentence-case. The icon contains no text.

## 3. Geometry

- App tile: 1024px square with a 232px corner radius.
- App mark: one bold coral insertion caret crossing horizontal ink rules.
- Menu extra: 44px source canvas for a 22pt Retina slot, with 6px optical
  padding and a single 3px stroke weight.

## 4. Material and depth

The app tile uses a top-left paper light, a subtle warm edge shade, one inner
highlight, and restrained contact shadows. The menu-extra asset is deliberately
flat: pure black plus alpha, because macOS owns its tint and interaction state.

## 5. Primitives

- **App tile:** warm paper squircle, dimensional but quiet.
- **Proofreader mark:** ink rules plus coral insertion caret.
- **Menu-extra mark:** monochrome caret crossing one baseline; no container,
  color, fill panel, or text.

## 6. Accessibility

The menu-extra image is configured as a macOS template image so it remains
legible in light, dark, and highlighted menu-bar states. Interactive text and
focus behavior remain native to Tauri/WebKit.

## 7. Motion

The logo and menu-extra icon are static. Motion is reserved for application
state changes such as toast appearance and dismissal.

## 8. Accepted debt

The app icon is authored in HTML/SVG and rasterized for Tauri. A future native
asset-catalog pipeline may replace this without changing the visual contract.
