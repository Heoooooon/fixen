fn main() {
    // Bake the repo-checkout CLI path in as a dev fallback, so a built app on
    // the dev machine works even when the globally installed fixen-cli is an
    // older release without --gui.
    let dev_cli = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../bin/fixen.js")
        .canonicalize()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    println!("cargo:rustc-env=FIXEN_DEV_CLI={dev_cli}");
    tauri_build::build()
}
