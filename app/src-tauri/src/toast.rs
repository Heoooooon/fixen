//! Toast placement and history-watch seams (pure, unit-tested).

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
        assert!(!should_toast(None, Some("a")), "first observation is not news");
        assert!(!should_toast(Some("a"), Some("a")));
        assert!(!should_toast(Some("a"), None));
        assert!(should_toast(Some("a"), Some("b")));
    }
}
