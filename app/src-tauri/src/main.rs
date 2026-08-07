#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ax;
mod sidecar;
mod toast;

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use sidecar::{cli_candidates, parse_gui_url, CliCandidate};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const TOAST_W: f64 = 344.0;
const TOAST_H: f64 = 96.0;
const TOAST_SECONDS: u64 = 6;

struct Server {
    child: Mutex<Option<Child>>,
}

struct ToastGen(Arc<AtomicU64>);

fn history_file() -> PathBuf {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
            home.join(".config")
        });
    config.join("fixen").join("history.jsonl")
}

fn percent_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() * 3);
    for byte in raw.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Caret anchor when Accessibility is granted, else the mouse cursor.
fn toast_anchor(app: &AppHandle) -> Option<(f64, f64)> {
    if let Some(anchor) = ax::caret_anchor() {
        return Some(anchor);
    }
    app.cursor_position().ok().map(|p| (p.x, p.y))
}

fn show_toast(app: &AppHandle, line: String) {
    let Ok(record) = serde_json::from_str::<serde_json::Value>(&line) else { return };
    if let Some(previous) = app.get_webview_window("toast") {
        let _ = previous.destroy();
    }
    let (anchor_x, anchor_y) = match toast_anchor(app) {
        Some(anchor) => anchor,
        None => return,
    };
    let monitor = app
        .monitor_from_point(anchor_x, anchor_y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let bounds_pos = monitor.position();
    let bounds_size = monitor.size();
    // Work in physical pixels relative to this monitor, then translate back.
    let (x, y) = toast::clamp_toast(
        anchor_x - bounds_pos.x as f64,
        anchor_y - bounds_pos.y as f64,
        TOAST_W * scale,
        TOAST_H * scale,
        bounds_size.width as f64,
        bounds_size.height as f64,
    );
    let position = tauri::PhysicalPosition::new(
        (x + bounds_pos.x as f64) as i32,
        (y + bounds_pos.y as f64) as i32,
    );

    let url = format!("toast.html?d={}", percent_encode(&record.to_string()));
    let Ok(window) = WebviewWindowBuilder::new(app, "toast", WebviewUrl::App(url.into()))
        .title("fixen toast")
        .inner_size(TOAST_W, TOAST_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .build()
    else {
        return;
    };
    let _ = window.set_position(position);

    // Auto-hide: only the newest toast generation may close the window.
    let generation = {
        let state = app.state::<ToastGen>();
        state.0.fetch_add(1, Ordering::SeqCst) + 1
    };
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(TOAST_SECONDS));
        let inner = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let state = inner.state::<ToastGen>();
            if state.0.load(Ordering::SeqCst) == generation {
                if let Some(window) = inner.get_webview_window("toast") {
                    let _ = window.destroy();
                }
            }
        });
    });
}

fn watch_history(app: AppHandle) {
    std::thread::spawn(move || {
        let file = history_file();
        let read_latest = || {
            std::fs::read_to_string(&file)
                .ok()
                .and_then(|body| toast::latest_entry_id(&body).map(|id| (id, body)))
        };
        let mut previous = read_latest().map(|(id, _)| id);
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let current = read_latest();
            let current_id = current.as_ref().map(|(id, _)| id.as_str());
            if toast::should_toast(previous.as_deref(), current_id) {
                let (_, body) = current.as_ref().unwrap();
                if let Some(line) = body.lines().rev().find(|l| !l.trim().is_empty()) {
                    let line = line.to_string();
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || show_toast(&handle, line));
                }
            }
            if let Some((id, _)) = current {
                previous = Some(id);
            }
        }
    });
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
    if path.is_empty() { None } else { Some(path.into()) }
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_panel])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let (child, url) = start_server().ok_or(
                "could not start `fixen --gui` — install fixen-cli or set FIXEN_APP_CLI",
            )?;
            app.manage(Server { child: Mutex::new(Some(child)) });
            app.manage(ToastGen(Arc::new(AtomicU64::new(0))));
            watch_history(app.handle().clone());

            let external: tauri::Url = url.parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(external))
                .title("fixen")
                .inner_size(430.0, 680.0)
                .min_inner_size(360.0, 480.0)
                .always_on_top(true)
                .visible(true)
                .skip_taskbar(true)
                .build()?;

            let quit = MenuItem::with_id(app, "quit", "Quit fixen", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            TrayIconBuilder::with_id("fixen-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .tooltip("fixen — corrections")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
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
