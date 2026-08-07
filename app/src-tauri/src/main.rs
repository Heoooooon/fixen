#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ax;
mod sidecar;
mod toast;

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use sidecar::{cli_candidates, parse_gui_url, CliCandidate};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

struct Server {
    child: Mutex<Option<Child>>,
}

#[derive(Debug, PartialEq, Eq)]
enum TrayAction {
    Open,
    Accessibility,
    Quit,
}

fn tray_action(id: &str) -> Option<TrayAction> {
    match id {
        "open" => Some(TrayAction::Open),
        "accessibility" => Some(TrayAction::Accessibility),
        "quit" => Some(TrayAction::Quit),
        _ => None,
    }
}

#[tauri::command]
fn open_panel(app: AppHandle) {
    if let Some(toast) = app.get_webview_window("toast") {
        let _ = toast.destroy();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn which_fixen() -> Option<std::path::PathBuf> {
    let out = Command::new("which").arg("fixen").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path.into())
    }
}

/// Try one candidate: spawn `<cli> --gui --port 0` and wait for the URL line.
/// An old CLI without --gui exits immediately; we detect that as failure and
/// let the caller move on to the next candidate.
fn try_spawn(candidate: &CliCandidate) -> Option<(Child, String)> {
    let mut child = Command::new(&candidate.program)
        .args(&candidate.args)
        .args(["--gui", "--port", "0"])
        .env("FIXEN_GUI_NO_OPEN", "1")
        .env("NO_COLOR", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            if let Some(url) = parse_gui_url(&line) {
                let _ = tx.send(Some(url));
                // Keep draining so the child never blocks on a full pipe.
                continue;
            }
        }
        let _ = tx.send(None);
    });

    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Some(url)) => return Some((child, url)),
            Ok(None) => {
                let _ = child.kill();
                return None;
            }
            Err(_) => {
                if let Ok(Some(_)) = child.try_wait() {
                    return None; // exited without a URL (e.g. unknown --gui)
                }
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    return None;
                }
            }
        }
    }
}

fn start_server() -> Option<(Child, String)> {
    let env_override = std::env::var("FIXEN_APP_CLI").ok();
    let dev_cli = option_env!("FIXEN_DEV_CLI").filter(|s| !s.is_empty());
    let candidates = cli_candidates(env_override.as_deref(), which_fixen(), dev_cli);
    for candidate in &candidates {
        if let Some(found) = try_spawn(candidate) {
            return Some(found);
        }
    }
    None
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_accessibility_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_panel])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let (child, url) = start_server()
                .ok_or("could not start `fixen --gui` — install fixen-cli or set FIXEN_APP_CLI")?;
            app.manage(Server {
                child: Mutex::new(Some(child)),
            });
            app.manage(toast::ToastGen::default());
            toast::watch_history(app.handle().clone());

            let external: tauri::Url = url.parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(external))
                .title("fixen")
                .inner_size(430.0, 680.0)
                .min_inner_size(360.0, 480.0)
                .always_on_top(true)
                .visible(true)
                .skip_taskbar(true)
                .build()?;

            let open = MenuItem::with_id(app, "open", "Open fixen", true, Some("CmdOrCtrl+O"))?;
            let accessibility = MenuItem::with_id(
                app,
                "accessibility",
                "Accessibility Settings…",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit fixen", true, Some("CmdOrCtrl+Q"))?;
            let menu = Menu::with_items(app, &[&open, &accessibility, &separator, &quit])?;
            // Monochrome template icon: macOS recolors it for light/dark
            // menu bars and the highlighted state, like native menu extras.
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            TrayIconBuilder::with_id("fixen-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("fixen — corrections")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match tray_action(event.id.as_ref()) {
                    Some(TrayAction::Open) => show_window(app),
                    Some(TrayAction::Accessibility) => open_accessibility_settings(),
                    Some(TrayAction::Quit) => app.exit(0),
                    None => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the panel hides it; the app lives in the tray.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running fixen app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(server) = app.try_state::<Server>() {
                    if let Some(mut child) = server.child.lock().unwrap().take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_menu_ids_map_to_actions() {
        assert_eq!(tray_action("open"), Some(TrayAction::Open));
        assert_eq!(
            tray_action("accessibility"),
            Some(TrayAction::Accessibility)
        );
        assert_eq!(tray_action("quit"), Some(TrayAction::Quit));
        assert_eq!(tray_action("unknown"), None);
    }
}
