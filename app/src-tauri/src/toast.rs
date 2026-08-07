//! Toast placement and history-watch seams (pure, unit-tested).

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::ax;

const TOAST_W: f64 = 344.0;
const TOAST_H: f64 = 96.0;
const TOAST_SECONDS: u64 = 6;

#[derive(Default)]
pub struct ToastGen(Arc<AtomicU64>);

fn history_file() -> PathBuf {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default();
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
    let Ok(record) = serde_json::from_str::<serde_json::Value>(&line) else {
        return;
    };
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
    let (x, y) = clamp_toast(
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

pub fn watch_history(app: AppHandle) {
    std::thread::spawn(move || {
        let file = history_file();
        let read_latest = || {
            std::fs::read_to_string(&file)
                .ok()
                .and_then(|body| latest_entry_id(&body).map(|id| (id, body)))
        };
        let mut previous = read_latest().map(|(id, _)| id);
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let current = read_latest();
            let current_id = current.as_ref().map(|(id, _)| id.as_str());
            if should_toast(previous.as_deref(), current_id) {
                if let Some((_, body)) = current.as_ref() {
                    if let Some(line) = body.lines().rev().find(|line| !line.trim().is_empty()) {
                        let line = line.to_string();
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || show_toast(&handle, line));
                    }
                }
            }
            if let Some((id, _)) = current {
                previous = Some(id);
            }
        }
    });
}

/// Place a 'w x h' toast near an anchor point (below-right, small offset),
/// clamped so the whole toast stays on a 'screen_w x screen_h' screen with an
/// 8px margin.
pub fn clamp_toast(
    anchor_x: f64,
    anchor_y: f64,
    w: f64,
    h: f64,
    screen_w: f64,
    screen_h: f64,
) -> (f64, f64) {
    const MARGIN: f64 = 8.0;
    const OFFSET: f64 = 12.0;
    let x = (anchor_x + OFFSET).clamp(MARGIN, (screen_w - w - MARGIN).max(MARGIN));
    let y = (anchor_y + OFFSET + 4.0).clamp(MARGIN, (screen_h - h - MARGIN).max(MARGIN));
    (x, y)
}

/// The id of the newest history entry in a history.jsonl body, if any.
pub fn latest_entry_id(content: &str) -> Option<String> {
    content
        .lines()
        .rev()
        .filter(|line| !line.trim().is_empty())
        .find_map(|line| {
            let value: serde_json::Value = serde_json::from_str(line).ok()?;
            Some(value.get("id")?.as_str()?.to_string())
        })
}

/// Whether a newly observed id warrants a toast. The first observation after
/// launch never toasts (it is an old entry), and unchanged ids never toast.
pub fn should_toast(prev: Option<&str>, current: Option<&str>) -> bool {
    matches!((prev, current), (Some(p), Some(c)) if p != c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toast_sits_below_right_of_the_anchor() {
        let (x, y) = clamp_toast(100.0, 200.0, 340.0, 120.0, 1440.0, 900.0);
        assert!((x - 112.0).abs() < 1.0, "x={x}");
        assert!((y - 216.0).abs() < 1.0, "y={y}");
    }

    #[test]
    fn toast_is_clamped_inside_the_screen() {
        // anchor at the bottom-right corner: toast must fully fit with margin
        let (x, y) = clamp_toast(1430.0, 890.0, 340.0, 120.0, 1440.0, 900.0);
        assert!(x + 340.0 <= 1440.0 - 8.0 + 0.01, "x={x}");
        assert!(y + 120.0 <= 900.0 - 8.0 + 0.01, "y={y}");
        assert!(x >= 8.0 && y >= 8.0);
    }

    #[test]
    fn latest_id_reads_the_last_valid_line() {
        let body = concat!(
            "{\"id\":\"aaa\",\"corrected\":\"x\"}\n",
            "{\"id\":\"bbb\",\"corrected\":\"y\"}\n",
        );
        assert_eq!(latest_entry_id(body).as_deref(), Some("bbb"));
        assert_eq!(latest_entry_id(""), None);
        assert_eq!(latest_entry_id("not json\n"), None);
        // trailing garbage after a valid line: the valid line wins
        let mixed = "{\"id\":\"ccc\"}\nnot json\n";
        assert_eq!(latest_entry_id(mixed).as_deref(), Some("ccc"));
    }

    #[test]
    fn only_a_changed_known_id_toasts() {
        assert!(
            !should_toast(None, Some("a")),
            "first observation is not news"
        );
        assert!(!should_toast(Some("a"), Some("a")));
        assert!(!should_toast(Some("a"), None));
        assert!(should_toast(Some("a"), Some("b")));
    }
}
