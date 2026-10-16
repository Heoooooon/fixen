// Entry point for `bun build --compile` (the macOS app's bundled CLI).
// Embeds bin/gui.html as text so the dashboard does not depend on a file
// next to the build machine's checkout, then runs the CLI as if invoked directly.
import guiPage from "../bin/gui.html" with { type: "text" };

globalThis.__FIXEN_GUI_PAGE = guiPage;
globalThis.__FIXEN_SIDECAR_MAIN = true;
await import("../bin/fixen.js");
